/* =====================================================================
   js/app.js — acquisition, the pipeline cycle, and the clock
   ---------------------------------------------------------------------
   One cycle = acquire one frame into SRAM, then push the oldest frame in
   SRAM through preprocess → model → commit. The timer runs on
   setInterval rather than requestAnimationFrame so the simulation keeps
   stepping when the tab is backgrounded.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.app = (function(){
  'use strict';

  var util = SAT.util, S = SAT.state, cfg = SAT.cfg;
  var MB = util.MB, KB = util.KB;

  var imgCache = [];
  SAT.pendingFile = null;

  /* ---------------------------------------------------------------- */
  /* dataset loading                                                   */
  /* ---------------------------------------------------------------- */
  function preloadTiles(){
    imgCache = SAT.dataset.tiles.map(function(t){
      var im = new Image();
      im.src = SAT.dataset.root + t.file;
      return im;
    });
  }

  function readyImages(){
    return imgCache.filter(function(i){ return i && i.complete && i.naturalWidth > 0; }).length;
  }

  /* Draw the tile into a working canvas. `shift` is a deterministic crop
     offset so a revisited tile is not byte-identical to last pass. */
  function drawTile(img, shift){
    var W = SAT.dataset.tileSize;
    var c = document.createElement('canvas');
    c.width = W; c.height = W;
    var g = c.getContext('2d');
    var z = 1.07;
    var dw = W * z, dh = W * z;
    g.drawImage(img, -((dw - W) / 2) - shift, -((dh - W) / 2) - shift, dw, dh);
    return c;
  }

  /* ---------------------------------------------------------------- */
  /* acquisition                                                       */
  /* ---------------------------------------------------------------- */
  async function acquireFrame(){
    if (cfg.source === 'dataset'){
      var tiles = SAT.dataset.tiles;
      var idx;
      if (cfg.tile === 'cycle'){
        idx = S.seq % tiles.length;
      } else {
        idx = tiles.findIndex(function(t){ return t.id === cfg.tile; });
        if (idx < 0) idx = 0;
      }
      var img = imgCache[idx];
      if (!img || !img.complete) await util.sleep(40);
      if (!img || !img.naturalWidth){
        SAT.log('ERR', 'tile failed to load: ' + util.esc(tiles[idx].file), 'err');
        return null;
      }
      var shift = (S.pass % 4) * 3;
      return {
        canvas: drawTile(img, shift),
        tile: tiles[idx].id,
        label: tiles[idx].label,
        name: tiles[idx].id.toUpperCase() + '_' + String(S.seq).padStart(4, '0')
      };
    }

    if (cfg.source === 'url'){
      if (!cfg.url){ SAT.log('ERR', 'source=url but no URL set (settings → ingest)', 'err'); return null; }
      try {
        var im = new Image();
        im.crossOrigin = 'anonymous';
        var p = new Promise(function(res, rej){
          im.onload = res;
          im.onerror = function(){ rej(new Error('load failed / CORS')); };
        });
        im.src = cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
        await Promise.race([p, util.sleep(6000).then(function(){ throw new Error('timeout'); })]);
        var c = document.createElement('canvas');
        c.width = SAT.dataset.tileSize; c.height = SAT.dataset.tileSize;
        c.getContext('2d').drawImage(im, 0, 0, SAT.dataset.tileSize, SAT.dataset.tileSize);
        c.getContext('2d').getImageData(0, 0, 1, 1);   // taint probe
        return { canvas: c, tile: 'url', label: 'remote', name: 'URL_' + String(S.seq).padStart(4, '0') };
      } catch (err){
        SAT.log('ERR', 'fetch failed — ' + util.esc(err.message) + ' (host must allow CORS)', 'err');
        return null;
      }
    }

    if (cfg.source === 'file'){
      if (!SAT.pendingFile){ SAT.log('ERR', 'source=file but no file selected', 'err'); return null; }
      var im2 = new Image();
      await new Promise(function(res, rej){ im2.onload = res; im2.onerror = rej; im2.src = SAT.pendingFile; });
      var c2 = document.createElement('canvas');
      c2.width = SAT.dataset.tileSize; c2.height = SAT.dataset.tileSize;
      c2.getContext('2d').drawImage(im2, 0, 0, SAT.dataset.tileSize, SAT.dataset.tileSize);
      return { canvas: c2, tile: 'file', label: 'local file', name: 'FILE_' + String(S.seq).padStart(4, '0') };
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* stages                                                            */
  /* ---------------------------------------------------------------- */
  async function ingest(){
    var got = await acquireFrame();
    if (!got) return;
    S.seq++;
    if (S.seq % SAT.dataset.tiles.length === 0) S.pass++;

    var bytes0;
    try {
      bytes0 = SAT.storage.encodeBytes(got.canvas, 0.9);
    } catch (e){
      fatal(e);
      return;
    }

    if (S.sramBytes + bytes0 > SAT.SRAM_BYTES){
      S.stats.stalls++;
      SAT.log('SRAM', '<u>full</u> ' + (S.sramBytes / MB).toFixed(2) + '/4.20M — ' +
                      util.esc(got.name) + ' held', 'warn');
      SAT.stage.led('#led-buf', 'busy');
      return;
    }

    var f = {
      id: got.name, tile: got.tile, label: got.label, seq: S.seq, ts: Date.now(),
      canvas: got.canvas, thumb: SAT.storage.thumbURL(got.canvas),
      bytes0: bytes0, q0: 0.90, quality: 0.90, bytes: bytes0,
      rel: 0, vis: 0, prio: 0, eff: 0, rank: 0, qfactor: 1, state: 'sram'
    };

    SAT.storage.pushSram(f);
    S.stats.captured++;
    SAT.log('INGEST', '<b>' + util.esc(f.id) + '</b> ' + (bytes0 / KB | 0) + 'K → SRAM ' +
                      (S.sramBytes / MB).toFixed(2) + '/4.20M');
    SAT.stage.flash('#n-ingest');
    SAT.stage.send('ingest', '#5aa9ff');
  }

  async function processHead(){
    if (!S.sram.length) return;
    var f = SAT.storage.shiftSram();
    SAT.stage.flash('#n-sram');
    SAT.stage.send('sram', '#9d8bff');

    /* --- preprocess --- */
    var feats;
    try {
      feats = SAT.preprocess.run(f.canvas);
    } catch (e){
      fatal(e);
      return;
    }
    S.stats.pre++;
    S.lastMask = feats.mask;

    SAT.log('PRE', SAT.dataset.tileSize + '→' + SAT.preprocess.DOWNSCALE +
                   ' μ<b>' + feats.mean.toFixed(0) + '</b> σ' + feats.std.toFixed(0) +
                   ' H' + feats.entropy.toFixed(2) + ' ' + feats.ms + 'ms');
    SAT.log('PRE', 'cloud <em>' + (feats.cloudFrac * 100).toFixed(1) + '%</em> edge ' +
                   feats.edgeFrac.toFixed(3) + ' br' + (feats.brightFrac * 100).toFixed(1));
    SAT.stage.flash('#n-pre');
    SAT.stage.send('pre', '#3fd8d8');

    /* --- model --- */
    var out = await SAT.model.infer(feats, f);
    f.rel = util.clamp(out.relevance, 0, 100);
    f.vis = util.clamp(out.visibility, 0, 100);
    f.prio = cfg.wRel * f.rel + (1 - cfg.wRel) * f.vis;
    f.eff = f.prio * f.qfactor;
    S.stats.scored++;
    S.loadEMA = S.loadEMA * 0.7 + 0.3 * Math.min(1, (Number(out.ms) || 30) / 260);

    if (out.terms){
      SAT.log('MODEL', 'e' + out.terms.e.toFixed(2) + ' h' + out.terms.h.toFixed(2) +
                       ' clear' + out.terms.clear.toFixed(2));
      SAT.log('MODEL', 'rel ' + out.terms.rel + '=<em>' + f.rel.toFixed(1) + '</em>');
      SAT.log('MODEL', 'vis ' + out.terms.vis + '=<em>' + f.vis.toFixed(1) + '</em>');
    }
    SAT.log('MODEL', 'prio ' + cfg.wRel.toFixed(1) + '·' + f.rel.toFixed(0) + '+' +
                     (1 - cfg.wRel).toFixed(1) + '·' + f.vis.toFixed(0) + '=<b>' +
                     f.prio.toFixed(1) + '</b> ' + out.ms + 'ms');
    SAT.stage.flash('#n-model');
    SAT.stage.send('model', '#ffb454');
    util.$('#n-model-2').textContent = 'rel ' + f.rel.toFixed(0) + ' / vis ' + f.vis.toFixed(0);

    /* --- gate --- */
    if (f.rel < cfg.rejectBelow){
      f.state = 'rejected';
      S.stats.rejected++;
      SAT.log('COMMIT', '<u>rejected</u> ' + util.esc(f.id) + ' rel ' + f.rel.toFixed(1) +
                        ' &lt; gate ' + cfg.rejectBelow, 'warn');
      SAT.ui.renderPreview(f, feats);
      return;
    }

    SAT.storage.commit(f);
    SAT.ui.renderPreview(f, feats);
  }

  async function cycle(){
    if (S.busy || S.fatal) return;
    S.busy = true;
    try {
      await ingest();
      await processHead();
    } catch (err){
      SAT.log('ERR', 'cycle exception: ' + util.esc(err.message), 'err');
      console.error(err);
    } finally {
      S.busy = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* clock                                                             */
  /* ---------------------------------------------------------------- */
  var lastTick = util.now(), lastRender = 0;

  function tick(){
    var ts = util.now();
    var dt = Math.min(150, ts - lastTick);
    lastTick = ts;

    if (S.running && !S.fatal){
      S.acc += dt * S.speed;
      if (S.acc >= cfg.interval && !S.busy){ S.acc = 0; cycle(); }
    }
    SAT.stage.tick(dt);

    if (ts - lastRender > 220){
      lastRender = ts;
      SAT.ui.renderDevices();
      SAT.ui.renderStore();
    }
  }

  /* ---------------------------------------------------------------- */
  /* fatal — almost always a file:// canvas taint                      */
  /* ---------------------------------------------------------------- */
  function fatal(err){
    S.fatal = String(err && err.message || err);
    toggleRun(false);
    SAT.log('ERR', 'pixels unreadable — ' + util.esc(S.fatal), 'err');
    SAT.log('ERR', 'serve the folder over http: <b>python3 serve.py</b>', 'err');
    var banner = util.$('#fatal');
    if (banner) banner.style.display = 'flex';
  }

  /* ---------------------------------------------------------------- */
  /* boot                                                              */
  /* ---------------------------------------------------------------- */
  async function boot(){
    preloadTiles();

    /* wait for the tiles, then probe whether we are allowed to read them */
    for (var i = 0; i < 60 && readyImages() < SAT.dataset.tiles.length; i++){
      await util.sleep(60);
    }

    SAT.stage.init();
    SAT.ui.bindAll();
    SAT.ui.clearPreview();

    try {
      var probe = document.createElement('canvas');
      probe.width = probe.height = 8;
      var pg = probe.getContext('2d');
      pg.drawImage(imgCache[0], 0, 0, 8, 8);
      pg.getImageData(0, 0, 1, 1);
    } catch (e){
      fatal(e);
      return;
    }

    var d = SAT.model.describe();
    SAT.log('SYS', 'SAT-IMG-PIPE boot · SRAM 4.20 MB fixed · mass memory ' + cfg.massMB + ' MB', 'warn');
    SAT.log('SYS', 'connector=<b>' + d.id + '/' + d.version + '</b> · SAT.model.register({...}) to swap');
    SAT.log('SYS', SAT.dataset.tiles.length + ' tiles · sequential, no random generation');
    SAT.log('SYS', 'space hold · s step · b burst · t settings');

    SAT.ui.renderDevices();
    SAT.ui.renderStore();
    setInterval(tick, 33);
  }

  /* ---------------------------------------------------------------- */
  /* controls exposed to ui.js                                         */
  /* ---------------------------------------------------------------- */
  function toggleRun(force){
    S.running = (force === undefined) ? !S.running : !!force;
    if (S.fatal) S.running = false;
    var btn = util.$('#btn-run');
    btn.textContent = S.running ? 'pause' : 'run';
    btn.classList.toggle('on', S.running);
    util.$('#rundot').classList.toggle('paused', !S.running);
    util.$('#h-state').textContent = S.running ? 'RUN' : 'HOLD';
  }

  async function burst(){
    for (var i = 0; i < 5; i++){
      if (S.busy) await util.sleep(120);
      await cycle();
    }
  }

  function reset(){
    S.frames = []; S.sram = []; S.sramBytes = 0; S.seq = 0; S.pass = 0;
    S.memHist = []; S.tpLog = []; S.recent = [];
    S.stats = { captured: 0, pre: 0, scored: 0, committed: 0,
                compressed: 0, evicted: 0, rejected: 0, stalls: 0 };
    SAT.log.clear();
    SAT.ui.clearPreview();
    SAT.log('SYS', 'session reset — memory cleared, counters zeroed', 'warn');
  }

  function purge(){
    S.frames = S.frames.filter(function(f){ return f.state === 'sram'; });
    SAT.log('GC', 'manual purge — store emptied', 'warn');
  }

  return {
    boot: boot,
    cycle: cycle,
    toggleRun: toggleRun,
    burst: burst,
    reset: reset,
    purge: purge,
    fatal: fatal
  };
})();

/* ---- button wiring that only touches the app layer ---- */
document.addEventListener('DOMContentLoaded', function(){
  var $ = SAT.util.$;
  $('#btn-run').addEventListener('click', function(){ SAT.app.toggleRun(); });
  $('#btn-step').addEventListener('click', function(){ SAT.app.cycle(); });
  $('#btn-burst').addEventListener('click', function(){ SAT.app.burst(); });
  $('#btn-reset').addEventListener('click', function(){ SAT.app.reset(); });
  $('#btn-clear').addEventListener('click', function(){ SAT.app.purge(); });

  $('#speed').addEventListener('click', function(e){
    var b = e.target.closest('button');
    if (!b) return;
    SAT.state.speed = parseFloat(b.dataset.s);
    Array.prototype.forEach.call($('#speed').children, function(x){
      x.classList.toggle('on', x === b);
    });
  });

  $('#btn-mask').addEventListener('click', function(){
    var S = SAT.state;
    S.maskOn = !S.maskOn;
    this.textContent = S.maskOn ? 'on' : 'off';
    this.classList.toggle('on', S.maskOn);
    SAT.ui.redraw();
  });

  /* register the bundled placeholder connector, then boot */
  SAT.model.register(SAT.model.stubFeaturescore, true);
  SAT.model.onChange = function(c){
    $('#connector-info').textContent = c.id + '/' + (c.version || '?') + ' · local';
    $('#cfg-conn-id').textContent = c.id;
  };
  SAT.app.boot();
});
