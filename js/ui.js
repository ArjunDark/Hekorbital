/* =====================================================================
   js/ui.js — every rendered surface except the stage
   Device panels, the frame preview, the storage table and the settings
   drawer. All of it is driven from SAT.state; nothing here decides
   policy.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.ui = (function(){
  'use strict';

  var util = SAT.util, $ = util.$, S = SAT.state, cfg = SAT.cfg;
  var MB = util.MB, KB = util.KB;

  var previewCv = $('#preview');
  var pctx = previewCv.getContext('2d');
  var tensorCv = $('#tensorview');
  var tctx = tensorCv.getContext('2d');

  /* ---------------------------------------------------------------- */
  /* frame preview                                                     */
  /* ---------------------------------------------------------------- */
  function drawMask(mask, res){
    var overlay = SAT.preprocess.maskOverlay(mask, res);
    pctx.globalAlpha = 0.85;
    pctx.drawImage(overlay, 0, 0, previewCv.width, previewCv.height);
    pctx.globalAlpha = 1;
  }

  function renderPreview(f, feats){
    S.lastFrame = f;
    S.lastFeats = feats;

    /* left: the frame as it sits in PSRAM */
    pctx.clearRect(0, 0, previewCv.width, previewCv.height);
    pctx.drawImage(f.canvas, 0, 0, previewCv.width, previewCv.height);
    if (S.maskOn && feats && feats.mask) drawMask(feats.mask, feats.maskRes);

    /* right: the INT8 tensor as it sits in SRAM, nearest-neighbour so the
       quantisation grid stays visible */
    tctx.imageSmoothingEnabled = false;
    tctx.clearRect(0, 0, tensorCv.width, tensorCv.height);
    if (feats && feats.tensor){
      var tc = SAT.preprocess.tensorCanvas(feats.tensor, feats.tensorRes);
      tctx.drawImage(tc, 0, 0, tensorCv.width, tensorCv.height);
    }

    $('#prev-badge').textContent = f.id;
    $('#cap-psram').textContent = 'PSRAM · ' + f.canvas.width + '² · ' +
      (f.canvas.width * f.canvas.height * 4 / 1048576).toFixed(2) + ' MB raw';
    $('#cap-sram').textContent = 'SRAM · ' + (feats ? feats.tensorRes : 0) + '² int8 · ' +
      (feats ? (feats.tensorBytes / 1024).toFixed(1) + ' KB' : '—');

    $('#f-rel').textContent = f.rel.toFixed(1);
    $('#f-vis').textContent = f.vis.toFixed(1);
    $('#f-prio').textContent = f.prio.toFixed(1);
    $('#f-cloud').textContent = (feats.cloudFrac * 100).toFixed(1) + '%';
    $('#f-edge').textContent = feats.edgeFrac.toFixed(4);
    $('#f-ent').textContent = feats.entropy.toFixed(2) + 'b';

    var hist = $('#hist');
    hist.innerHTML = '';
    for (var i = 0; i < 32; i++){
      var b = document.createElement('i');
      var h = feats.histMax ? feats.hist32[i] / feats.histMax : 0;
      b.style.height = Math.max(1, h * 18).toFixed(1) + 'px';
      if (i >= 22) b.className = 'hot';
      hist.appendChild(b);
    }
  }

  /* redraw the current frame (used by the mask toggle) without
     disturbing the feature readout */
  function redraw(){
    if (!S.lastFrame) return;
    pctx.clearRect(0, 0, previewCv.width, previewCv.height);
    pctx.drawImage(S.lastFrame.canvas, 0, 0, previewCv.width, previewCv.height);
    if (S.maskOn && S.lastMask) drawMask(S.lastMask, S.lastFeats ? S.lastFeats.maskRes : undefined);
  }

  function clearPreview(){
    pctx.fillStyle = '#080a12';
    pctx.fillRect(0, 0, previewCv.width, previewCv.height);
    tctx.fillStyle = '#080a12';
    tctx.fillRect(0, 0, tensorCv.width, tensorCv.height);
    pctx.fillStyle = '#2b3552';
    pctx.font = '11px monospace';
    pctx.fillText('awaiting first frame', 14, 24);
    $('#prev-badge').textContent = 'NO FRAME';
    $('#cap-psram').textContent = 'PSRAM · —';
    $('#cap-sram').textContent = 'SRAM · —';
    ['#f-rel','#f-vis','#f-prio','#f-cloud','#f-edge','#f-ent'].forEach(function(s){ $(s).textContent = '—'; });
    $('#hist').innerHTML = '';
  }

  /* ---------------------------------------------------------------- */
  /* device panels + stage readouts                                    */
  /* ---------------------------------------------------------------- */
  function renderDevices(){
    var pp = SAT.preprocess;
    var slots = pp.psram.length, slotsMax = pp.PSRAM_SLOTS;
    var psramPct = (slots / slotsMax) * 100;
    var tBytes = pp.lastTensor ? pp.lastTensor.bytes : 0;
    var tensorPct = (tBytes / pp.SRAM_LIMIT) * 100;

    var cap = cfg.massMB * MB;
    var used = SAT.storage.totalBytes();
    var memPct = (used / cap) * 100;

    $('#sat-sram').textContent = slots + ' / ' + slotsMax + ' slots · ' +
                                 (pp.psramBytes() / MB).toFixed(2) + ' MB';
    var sb = $('#sat-sram-bar');
    sb.style.width = util.clamp(psramPct, 0, 100).toFixed(1) + '%';
    sb.className = psramPct >= 100 ? 'red' : psramPct > 66 ? 'amber' : '';

    $('#sat-tensor').textContent = (tBytes / 1024).toFixed(1) + ' KB / 4.20 MB';
    var tb = $('#sat-tensor-bar');
    tb.style.width = Math.max(0.6, util.clamp(tensorPct, 0, 100)).toFixed(1) + '%';
    tb.className = tensorPct > 85 ? 'red' : '';

    $('#sat-mem').textContent = (used / MB).toFixed(2) + ' / ' + cfg.massMB.toFixed(2) + ' MB';
    var mb = $('#sat-mem-bar');
    mb.style.width = util.clamp(memPct, 0, 100).toFixed(1) + '%';
    mb.className = memPct > cfg.highWater ? 'red' : memPct > 55 ? 'amber' : '';
    $('#sat-wm').style.left = cfg.highWater + '%';

    var load = Math.round(util.clamp(S.loadEMA * 100, 0, 100));
    var loadEl = $('#sat-load');
    if (loadEl) loadEl.textContent = load + '%';
    var loadBar = $('#sat-load-bar');
    if (loadBar) loadBar.style.width = load + '%';

    $('#sat-pwr').textContent = (6.4 + (S.busy ? 1.8 : 0) + load * 0.02).toFixed(1) + ' W';
    S.temp += ((24.1 + load * 0.055 + (S.busy ? 0.6 : 0)) - S.temp) * 0.02;
    $('#sat-temp').textContent = S.temp.toFixed(1) + ' °C';
    $('#sat-in').textContent = S.stats.captured;
    $('#sat-commit').textContent = S.stats.committed;
    $('#sat-rej').textContent = S.stats.rejected;

    SAT.stage.led('#led-buf', slots >= slotsMax ? 'crit' : slots ? 'busy' : 'off');
    SAT.stage.led('#led-mem', memPct > cfg.highWater ? 'crit' : used > 0 ? 'on' : 'off');
    SAT.stage.led('#led-gc', (S.stats.compressed || S.stats.evicted) ? 'on' : 'off');

    $('#p-cap').textContent = S.stats.captured;
    $('#p-pre').textContent = S.stats.pre;
    $('#p-score').textContent = S.stats.scored;
    $('#p-store').textContent = SAT.storage.stored().length;
    $('#p-comp').textContent = S.stats.compressed;
    $('#p-evict').textContent = S.stats.evicted;
    $('#p-stall').textContent = S.psramDrops;

    /* dock memory bar */
    $('#dock-mem-lbl').innerHTML = '<b>' + (used / MB).toFixed(2) + '</b> / ' + cfg.massMB.toFixed(2) + ' MB';
    var db = $('#dock-mem-bar');
    db.style.width = util.clamp(memPct, 0, 100).toFixed(1) + '%';
    db.className = memPct > cfg.highWater ? 'red' : memPct > 55 ? 'amber' : '';
    $('#dock-wm').style.left = cfg.highWater + '%';
    $('#dock-mem-pct').textContent = memPct.toFixed(0) + '%';

    /* stage node readouts */
    $('#n-ingest-1').textContent = cfg.source === 'dataset'
      ? (cfg.tile === 'cycle' ? 'embedded · cycling' : cfg.tile) : cfg.source;
    $('#n-ingest-2').textContent = S.stats.captured + ' frames acquired';
    $('#n-sram-2').textContent = slots + '/' + slotsMax + ' slots · ' +
                                  (pp.psramBytes() / MB).toFixed(2) + ' MB';
    var nsb = $('#n-sram-bar');
    nsb.setAttribute('width', (144 * util.clamp(psramPct, 0, 100) / 100).toFixed(1));
    nsb.setAttribute('fill', psramPct >= 100 ? '#ff4d8d' : psramPct > 66 ? '#ffb454' : '#9d8bff');
    $('#n-pre-1').textContent = (tBytes / 1024).toFixed(1) + ' KB int8 · ' + S.stats.pre + ' run';

    var d = SAT.model.describe();
    $('#n-model-1').textContent = d.id;
    $('#n-model-3').textContent = 'connector · ' + d.mode;

    $('#n-mem-1').textContent = (used / MB).toFixed(2) + ' / ' + cfg.massMB.toFixed(2) + ' MB';
    var nmb = $('#n-mem-bar');
    nmb.setAttribute('width', (190 * util.clamp(memPct, 0, 100) / 100).toFixed(1));
    nmb.setAttribute('fill', memPct > cfg.highWater ? '#ff4d8d' : memPct > 55 ? '#ffb454' : '#7fdc86');
    var st = SAT.storage.stored();
    $('#n-mem-2').textContent = st.length + ' frames';
    var best = st.slice().sort(function(a, b){ return b.eff - a.eff; })[0];
    $('#n-mem-3').textContent = best ? ('top eff ' + best.eff.toFixed(1) + ' · ' + best.tile) : 'top score —';
    $('#n-gc-1').textContent = 'watermark ' + cfg.highWater + '% → ' + cfg.targetWater + '%';
    $('#n-gc-2').textContent = S.stats.compressed + ' comp · ' + S.stats.evicted + ' evict';

    /* topbar */
    var tNow = Date.now();
    S.tpLog = S.tpLog.filter(function(x){ return tNow - x.t < 5000; });
    var bps = S.tpLog.reduce(function(a, x){ return a + x.b; }, 0) / 5;
    $('#h-tp').textContent = bps >= MB ? (bps / MB).toFixed(1) + ' MB/s' : (bps / KB).toFixed(0) + ' KB/s';
    $('#h-frames').textContent = S.stats.captured;
    $('#h-avg').textContent = st.length
      ? (st.reduce(function(s, f){ return s + f.eff; }, 0) / st.length).toFixed(1) : '—';
    $('#h-gc').textContent = S.stats.evicted + ' / ' + S.stats.compressed;
    var now = new Date();
    var utc = String(now.getUTCHours()).padStart(2,'0') + ':' +
              String(now.getUTCMinutes()).padStart(2,'0') + ':' +
              String(now.getUTCSeconds()).padStart(2,'0');
    var utcEl = $('#h-utc');
    if (utcEl) utcEl.textContent = utc + 'Z';

    var pill = $('#sat-pill');
    if (pill){
      pill.textContent = S.fatal ? 'FAULT'
        : (S.stats.rejected && !S.stats.committed) ? 'DEGRADED'
        : 'NOMINAL';
      pill.style.color = S.fatal ? 'var(--red)'
        : (S.stats.rejected && !S.stats.committed) ? 'var(--amber)' : 'var(--green)';
    }

    var el = Date.now() - S.clockStart;
    $('#h-clock').textContent =
      String(Math.floor(el / 3600000)).padStart(2, '0') + ':' +
      String(Math.floor(el / 60000) % 60).padStart(2, '0') + ':' +
      String(Math.floor(el / 1000) % 60).padStart(2, '0');

    /* memory sparkline */
    S.memHist.push(util.clamp(memPct, 0, 100));
    if (S.memHist.length > 120) S.memHist.shift();
    var sl = $('#spark-line');
    if (sl && S.memHist.length > 1){
      var h = S.memHist;
      sl.setAttribute('points', h.map(function(v, i){
        return ((i / (h.length - 1)) * 100).toFixed(2) + ',' + (26 - (v / 100) * 24).toFixed(2);
      }).join(' '));
      sl.setAttribute('stroke', memPct > cfg.highWater ? '#ff5f7a' : '#3fd8d8');
      var y = (26 - (cfg.highWater / 100) * 24).toFixed(1);
      $('#spark-wm').setAttribute('y1', y);
      $('#spark-wm').setAttribute('y2', y);
    }
    $('#spark-val').textContent = memPct.toFixed(0) + '%';

    /* recent storage actions */
    var rl = $('#recent-list');
    if (rl){
      rl.innerHTML = S.recent.length
        ? S.recent.map(function(r){
            return '<div><span class="a ' + r.kind + '">' + r.kind.toUpperCase() + '</span><span>' +
                   util.esc(r.txt) + '</span></div>';
          }).join('')
        : '<span style="color:#454e63">—</span>';
    }

    /* connector label */
    $('#connector-info').textContent = d.id + '/' + d.version + ' · ' + d.mode;
  }

  /* ---------------------------------------------------------------- */
  /* storage table — row count is computed so it never scrolls          */
  /* ---------------------------------------------------------------- */
  function renderStore(){
    var body = $('#store-body');
    var live = SAT.storage.stored().sort(function(a, b){ return b.eff - a.eff; });
    live.forEach(function(f, i){ f.rank = i + 1; });

    var dead = S.frames.filter(function(f){ return f.state === 'discarded'; })
      .sort(function(a, b){ return (b.discardedAt || 0) - (a.discardedAt || 0); })
      .slice(0, 3);

    var box = document.querySelector('.dock-bd');
    var avail = (box ? box.clientHeight : 140) - 26;   // column header + slack
    var capRows = Math.max(3, Math.floor(avail / 25)); // measured row pitch
    var rows = live.slice(0, Math.max(1, capRows - dead.length)).concat(dead);

    $('#store-empty').style.display = rows.length ? 'none' : 'block';
    $('#dock-note').textContent = live.length + ' stored'
      + (S.stats.evicted ? ' · ' + S.stats.evicted + ' evicted' : '')
      + (live.length > rows.length - dead.length ? ' · top ' + (rows.length - dead.length) + ' shown' : '');

    var html = '';
    for (var i = 0; i < rows.length; i++){
      var f = rows[i];
      var isDead = f.state === 'discarded';
      var cls = isDead ? 'discarded' : (f.state === 'compressed' ? 'compressed' : '');
      var flash = S.flashIds.has(f.id) ? (isDead ? ' flash-out' : ' flash') : '';
      html += '<tr class="' + cls + flash + '">'
        + '<td class="rk' + (f.rank && f.rank <= 3 ? ' top' : '') + '">' + (isDead ? '—' : f.rank) + '</td>'
        + '<td class="id">' + util.esc(f.id) + '</td>'
        + '<td>' + (isDead ? '' : '<img class="th" src="' + f.thumb + '" alt="">') + '</td>'
        + '<td>' + util.esc(f.tile) + '</td>'
        + '<td class="num">' + util.fmtB(f.bytes) + '</td>'
        + '<td class="num q">' + f.quality.toFixed(2) + '</td>'
        + '<td class="num">' + f.rel.toFixed(1) + '</td>'
        + '<td class="num">' + f.vis.toFixed(1) + '</td>'
        + '<td class="num">' + f.prio.toFixed(1) + '</td>'
        + '<td class="num"><b style="color:' + (isDead ? '#5c6478' : '#e8eef8') + '">' + f.eff.toFixed(1) + '</b></td>'
        + '<td>' + (isDead ? '<span class="badge dead">EVICTED</span>'
                 : f.state === 'compressed' ? '<span class="badge comp">COMPRESSED</span>'
                 : '<span class="badge live">STORED</span>') + '</td></tr>';
    }
    body.innerHTML = html;
    S.flashIds.clear();

    /* prune stale rows */
    var cutoff = Date.now() - 25000;
    S.frames = S.frames.filter(function(f){
      return !(f.state === 'discarded' && (f.discardedAt || 0) < cutoff) && f.state !== 'rejected';
    });
  }

  /* ---------------------------------------------------------------- */
  /* settings drawer                                                   */
  /* ---------------------------------------------------------------- */
  var drawer = $('#drawer'), scrim = $('#scrim');

  function openDrawer(on){
    drawer.classList.toggle('open', on);
    scrim.classList.toggle('on', on);
  }

  function bindNum(sel, key, after){
    var el = $(sel);
    if (!el) return;
    el.value = cfg[key];
    el.addEventListener('change', function(){
      var v = parseFloat(el.value);
      if (!isFinite(v)) return;
      cfg[key] = v;
      if (after) after(v);
      SAT.log('SYS', 'cfg.' + key + ' = <em>' + v + '</em>');
    });
  }

  function bindAll(){
    /* label the dataset option and credit the imagery */
    var opt = $('#cfg-source').querySelector('option[value="dataset"]');
    if (opt) opt.textContent = 'embedded dataset · ' + SAT.dataset.tiles.length + ' real tiles';
    var cr = $('#credits');
    if (cr) cr.textContent = 'Tiles: ' + SAT.dataset.tiles.map(function(t){ return t.title; }).join(' · ');

    /* --- drawer open/close --- */
    $('#btn-settings').addEventListener('click', function(){ openDrawer(true); });
    $('#btn-close-settings').addEventListener('click', function(){ openDrawer(false); });
    $('#btn-done-settings').addEventListener('click', function(){ openDrawer(false); });
    scrim.addEventListener('click', function(){ openDrawer(false); });

    /* --- memory --- */
    bindNum('#cfg-mass', 'massMB', function(){ SAT.storage.reclaim(); });
    bindNum('#cfg-high', 'highWater');
    bindNum('#cfg-target', 'targetWater');
    bindNum('#cfg-qfloor', 'qFloor');
    bindNum('#cfg-protect', 'protectTop');

    /* --- ingest --- */
    bindNum('#cfg-interval', 'interval');
    bindNum('#cfg-reject', 'rejectBelow');

    /* --- ingress / SRAM scratchpad --- */
    bindNum('#cfg-tres', 'tensorRes', function(v){
      SAT.preprocess.TENSOR_RES = v;
      SAT.log('SYS', 'tensor resolution → <em>' + v + '²</em> (' +
                      (v * v * 3 / 1024).toFixed(1) + ' KB int8)');
    });
    bindNum('#cfg-slots', 'psramSlots', function(v){
      SAT.preprocess.PSRAM_SLOTS = v;
      SAT.log('SYS', 'PSRAM ring depth → <em>' + v + '</em> slots');
    });

    /* --- model --- */
    bindNum('#cfg-latency', 'latency');
    $('#cfg-wrel').addEventListener('input', function(e){
      cfg.wRel = parseFloat(e.target.value);
      S.frames.forEach(function(f){
        f.prio = cfg.wRel * f.rel + (1 - cfg.wRel) * f.vis;
        f.eff = f.prio * f.qfactor;
      });
    });
    $('#cfg-endpoint').addEventListener('change', function(e){
      cfg.endpoint = e.target.value.trim();
      SAT.log('MODEL', 'endpoint → ' + (cfg.endpoint ? '<em>' + util.esc(cfg.endpoint) + '</em>' : 'none (local)'));
    });

    /* --- source --- */
    $('#cfg-source').addEventListener('change', function(e){
      cfg.source = e.target.value;
      $('#row-tile').style.display = cfg.source === 'dataset' ? 'flex' : 'none';
      $('#row-url').style.display = cfg.source === 'url' ? 'flex' : 'none';
      $('#row-file').style.display = cfg.source === 'file' ? 'flex' : 'none';
      SAT.log('SYS', 'ingest source → <em>' + cfg.source + '</em>');
    });
    $('#cfg-url').addEventListener('change', function(e){
      cfg.url = e.target.value.trim();
      SAT.log('SYS', 'url set');
    });
    $('#cfg-file').addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function(){
        SAT.pendingFile = rd.result;
        SAT.log('SYS', 'file loaded → <b>' + util.esc(file.name) + '</b>');
      };
      rd.readAsDataURL(file);
    });

    /* --- defaults --- */
    $('#btn-reset-cfg').addEventListener('click', function(){
      Object.assign(cfg, SAT.DEFAULTS);
      SAT.preprocess.TENSOR_RES = cfg.tensorRes;
      SAT.preprocess.PSRAM_SLOTS = cfg.psramSlots;
      $('#cfg-mass').value = cfg.massMB;
      $('#cfg-high').value = cfg.highWater;
      $('#cfg-target').value = cfg.targetWater;
      $('#cfg-qfloor').value = cfg.qFloor;
      $('#cfg-protect').value = cfg.protectTop;
      $('#cfg-interval').value = cfg.interval;
      $('#cfg-tres').value = cfg.tensorRes;
      $('#cfg-slots').value = cfg.psramSlots;
      $('#cfg-reject').value = cfg.rejectBelow;
      $('#cfg-latency').value = cfg.latency;
      $('#cfg-wrel').value = cfg.wRel;
      $('#cfg-source').value = cfg.source;
      $('#cfg-endpoint').value = '';
      $('#cfg-tile').value = cfg.tile;
      SAT.log('SYS', 'settings restored to defaults', 'warn');
    });

    /* --- tile select --- */
    var tileSel = $('#cfg-tile');
    var o = document.createElement('option');
    o.value = 'cycle'; o.textContent = 'cycle all ' + SAT.dataset.tiles.length;
    tileSel.appendChild(o);
    SAT.dataset.tiles.forEach(function(t){
      var op = document.createElement('option');
      op.value = t.id; op.textContent = t.label;
      tileSel.appendChild(op);
    });
    tileSel.addEventListener('change', function(e){
      cfg.tile = e.target.value;
      SAT.log('SYS', 'tile → <em>' + e.target.value + '</em>');
    });

    /* --- keyboard --- */
    document.addEventListener('keydown', function(e){
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space'){ e.preventDefault(); SAT.app.toggleRun(); }
      else if (e.key === 's') SAT.app.cycle();
      else if (e.key === 'b') SAT.app.burst();
      else if (e.key === 't') openDrawer(!drawer.classList.contains('open'));
      else if (e.key === 'Escape') openDrawer(false);
    });

    window.addEventListener('resize', function(){ renderDevices(); renderStore(); });
  }

  return {
    renderPreview: renderPreview,
    redraw: redraw,
    clearPreview: clearPreview,
    renderDevices: renderDevices,
    renderStore: renderStore,
    openDrawer: openDrawer,
    bindAll: bindAll,
    pctx: pctx,
    previewCv: previewCv
  };
})();
