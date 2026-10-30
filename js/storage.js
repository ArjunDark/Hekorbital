/* =====================================================================
   js/storage.js — SRAM staging buffer, mass memory, and the GC policy
   ---------------------------------------------------------------------
   SRAM is a fixed 4.2 MB FIFO. Mass memory is whatever the operator sets.
   When a commit would cross the high watermark, the storage manager:
     1. compresses the lowest-ranked unprotected frames (q -= 0.15 a step)
     2. evicts once a frame reaches the quality floor
     3. if it still does not fit, keeps whichever of {new frame, worst
        stored frame} ranks higher
   Ranking is effective, not raw: eff = priority · (0.5 + 0.5·q/q₀), so a
   compressed frame falls down the table the moment it is re-encoded.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.storage = (function(){
  'use strict';

  var util = SAT.util, S = SAT.state, cfg = SAT.cfg;
  var MB = util.MB, KB = util.KB;

  /* ---- bytes of a real JPEG encode, reported at native resolution ---- */
  function encodeBytes(canvas, q){
    var url = canvas.toDataURL('image/jpeg', q);
    var b64 = url.length - 'data:image/jpeg;base64,'.length;
    return Math.round(b64 * 3 / 4 * SAT.AREA_SCALE());
  }

  function thumbURL(canvas){
    var c = document.createElement('canvas');
    c.width = 40; c.height = 40;
    c.getContext('2d').drawImage(canvas, 0, 0, 40, 40);
    return c.toDataURL('image/jpeg', 0.6);
  }

  function totalBytes(){
    var t = 0;
    for (var i = 0; i < S.frames.length; i++){
      var f = S.frames[i];
      if (f.state === 'live' || f.state === 'compressed') t += f.bytes;
    }
    return t;
  }

  function stored(){
    return S.frames.filter(function(f){ return f.state === 'live' || f.state === 'compressed'; });
  }

  /* ---- SRAM ---- */
  function pushSram(frame){
    if (S.sramBytes + frame.bytes0 > SAT.SRAM_BYTES) return false;
    S.sram.push(frame);
    S.sramBytes += frame.bytes0;
    S.frames.push(frame);
    return true;
  }

  function shiftSram(){
    var f = S.sram.shift();
    if (f) S.sramBytes = Math.max(0, S.sramBytes - f.bytes0);
    return f;
  }

  /* ---- recent-action list shown in the left column ---- */
  function pushRecent(kind, txt){
    S.recent.unshift({ kind: kind, txt: txt });
    if (S.recent.length > 5) S.recent.pop();
  }

  /* ---- GC ---- */
  function runGC(incoming, usage){
    var cap = cfg.massMB * MB;
    var target = cap * cfg.targetWater / 100;
    var live = stored();

    var protect = new Set(
      live.slice().sort(function(a, b){ return b.eff - a.eff; })
          .slice(0, cfg.protectTop).map(function(f){ return f.id; })
    );

    var cands = live.slice().sort(function(a, b){ return a.eff - b.eff; });

    for (var i = 0; i < cands.length; i++){
      var f = cands[i];
      if (usage + incoming <= target) break;
      if (protect.has(f.id)) continue;

      if (f.quality > cfg.qFloor + 0.001){
        var nq = Math.max(cfg.qFloor, +(f.quality - 0.15).toFixed(2));
        var nb = Math.max(4096, Math.round(f.bytes0 * Math.pow(nq / f.q0, 1.9)));
        var saved = f.bytes - nb;
        var oldEff = f.eff, oldQ = f.quality, oldB = f.bytes;

        f.quality = nq;
        f.bytes = nb;
        f.qfactor = 0.5 + 0.5 * (nq / f.q0);
        f.eff = f.prio * f.qfactor;
        f.state = 'compressed';

        usage -= saved;
        S.stats.compressed++;
        pushRecent('comp', f.id + ' q' + (nq * 100 | 0) + ' −' + (saved / KB | 0) + 'K');
        SAT.log('GC', 'comp ' + util.esc(f.id) + ' ' + (oldQ * 100 | 0) + '→' + (nq * 100 | 0) + ' ' +
                      (oldB / KB | 0) + '→' + (nb / KB | 0) + 'K e' + oldEff.toFixed(0) + '→' + f.eff.toFixed(0));
        continue;
      }

      evict(f, 'floor');
      usage = totalBytes();
    }
    return usage;
  }

  function evict(f, why){
    f.state = 'discarded';
    f.discardedAt = Date.now();
    S.stats.evicted++;
    S.flashIds.add(f.id);
    pushRecent('evict', f.id + ' e' + f.eff.toFixed(0) + ' freed ' + (f.bytes / KB | 0) + 'K');
    SAT.log('GC', '<u>evict</u> ' + util.esc(f.id) + ' e' + f.eff.toFixed(0) +
                  ' freed ' + (f.bytes / KB | 0) + 'K');
  }

  /* ---- commit a scored frame ---- */
  function commit(f){
    var cap = cfg.massMB * MB;
    var usage = totalBytes();

    if (usage + f.bytes > cap * cfg.highWater / 100){
      SAT.log('GC', 'watermark ' + cfg.highWater + '% → target ' + cfg.targetWater + '%', 'warn');
      SAT.stage.flash('#n-gc');
      usage = runGC(f.bytes, usage);
    }

    if (usage + f.bytes > cfg.massMB * MB){
      var live = stored().sort(function(a, b){ return a.eff - b.eff; });
      var worst = live[0];
      if (worst && worst.eff < f.eff){
        evict(worst, 'lowest rank at capacity');
        usage = totalBytes();
      } else {
        f.state = 'rejected';
        S.stats.rejected++;
        SAT.log('COMMIT', '<u>rejected</u> ' + util.esc(f.id) + ' — no room, ranks below every stored frame', 'warn');
        return false;
      }
    }

    f.state = 'live';
    S.stats.committed++;
    S.tpLog.push({ t: Date.now(), b: f.bytes });
    S.flashIds.add(f.id);
    SAT.log('COMMIT', '<i>stored</i> <b>' + util.esc(f.id) + '</b> ' + (f.bytes / KB | 0) +
                      'K q' + (f.quality * 100 | 0) + ' → ' + ((usage + f.bytes) / MB).toFixed(1) +
                      '/' + cfg.massMB.toFixed(0) + 'M');
    SAT.stage.flash('#n-mem');
    SAT.stage.send('commit', '#7fdc86');
    return true;
  }

  /* ---- capacity shrink (settings → mass memory) ---- */
  function reclaim(){
    var cap = cfg.massMB * MB;
    var used = totalBytes();
    if (used <= cap) return;
    SAT.log('GC', 'capacity reduced below usage — reclaiming', 'warn');
    runGC(0, used);
    if (totalBytes() > cap){
      var live = stored().sort(function(a, b){ return a.eff - b.eff; });
      while (totalBytes() > cap && live.length) evict(live.shift(), 'capacity shrink');
    }
  }

  return {
    encodeBytes: encodeBytes,
    thumbURL: thumbURL,
    totalBytes: totalBytes,
    stored: stored,
    pushSram: pushSram,
    shiftSram: shiftSram,
    pushRecent: pushRecent,
    commit: commit,
    runGC: runGC,
    evict: evict,
    reclaim: reclaim
  };
})();
