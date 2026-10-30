/* =====================================================================
   js/config.js — constants, defaults, and the shared runtime state
   ===================================================================== */
window.SAT = window.SAT || {};

/* ---------- small helpers used everywhere ---------- */
SAT.util = {
  KB: 1024,
  MB: 1024 * 1024,
  $: function(s){ return document.querySelector(s); },
  clamp: function(v, a, b){ return Math.min(b, Math.max(a, v)); },
  fmtB: function(b){
    return b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB';
  },
  sleep: function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); },
  now: function(){ return performance.now(); },
  esc: function(s){
    return String(s).replace(/[&<>]/g, function(c){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }
};

/* ---------- fixed by the design, not by the user ---------- */
SAT.SRAM_BYTES = 4.2 * SAT.util.MB;   // onboard staging buffer
SAT.NATIVE_RES = 1024;                // resolution frame sizes are reported at

/* ---------- user-editable defaults (settings drawer) ---------- */
SAT.DEFAULTS = {
  massMB: 16,        // satellite mass memory, MB
  highWater: 85,     // GC triggers above this fill %
  targetWater: 60,   // evict down to this fill %
  qFloor: 0.35,      // below this quality a frame is dropped instead
  protectTop: 3,     // never compress/evict the top N frames
  source: 'dataset', // dataset | url | file
  tile: 'cycle',     // 'cycle' or a tile id
  url: '',
  interval: 900,     // ms between captures
  rejectBelow: 0,    // reject at ingest if relevance < this
  wRel: 0.6,         // priority = wRel*rel + (1-wRel)*vis
  latency: 90,       // simulated inference latency, ms
  endpoint: ''       // optional HTTP model endpoint
};

SAT.cfg = Object.assign({}, SAT.DEFAULTS);

/* ---------- runtime state ---------- */
SAT.state = {
  running: true,
  speed: 1,
  busy: false,
  acc: 0,
  t0: SAT.util.now(),
  seq: 0,
  pass: 0,
  frames: [],          // every frame object created this session
  sram: [],            // queue waiting to be processed
  sramBytes: 0,
  stats: { captured: 0, pre: 0, scored: 0, committed: 0,
           compressed: 0, evicted: 0, rejected: 0, stalls: 0 },
  lastFrame: null,
  lastMask: null,
  maskOn: false,
  loadEMA: 0,
  temp: 24.1,
  clockStart: Date.now(),
  tpLog: [],
  memHist: [],
  recent: [],
  flashIds: new Set(),
  fatal: null          // set when the canvas cannot be read (file:// taint)
};

/* area scale: tiles are 384² but sizes are reported at NATIVE_RES */
SAT.AREA_SCALE = function(){
  var t = SAT.dataset ? SAT.dataset.tileSize : 384;
  return Math.pow(SAT.NATIVE_RES / t, 2);
};
