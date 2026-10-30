/* =====================================================================
   preprocess/index.js — CubeSat ingress + preprocessing stage
   ---------------------------------------------------------------------
   Mirrors Cubesatsim_dataintake.py (reference/Cubesatsim_dataintake.py).
   Same three steps, same order, same numbers:

     1. INGEST   read the frame, keep the raw pixels        (PSRAM)
     2. STAGE    push the raw packet into a 3-slot ring     (PSRAM)
     3. TENSOR   area-average downscale to 160², subtract 128,
                 clip to [-128, 127], store as INT8         (SRAM)
                 and refuse the frame if it breaches the 4.2 MB limit

   The feature vector is then computed *from the INT8 tensor*, de-quantised,
   so every number the model sees describes exactly what survived the SRAM
   scratchpad — not a separate higher-resolution copy.

   Mapping to the Python module
     CubeSatIngressModule.process_sensor_frame  →  SAT.preprocess.run
     target_tensor_res=(160,160)                →  SAT.preprocess.TENSOR_RES
     sram_limit_mb=4.2                          →  SAT.preprocess.SRAM_LIMIT
     max_psram_slots=3                          →  SAT.preprocess.PSRAM_SLOTS
     np.clip(x-128, -128, 127).astype(int8)     →  quantise()
     cv2.resize(..., INTER_AREA)                →  areaResize()
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.preprocess = (function(){
  'use strict';

  var util = SAT.util;

  var api = {
    VERSION: '2.0.0',

    /* --- mirrors the Python constructor arguments --- */
    TENSOR_RES: 160,                        // target_tensor_res
    SRAM_LIMIT: Math.round(4.2 * 1024 * 1024),
    PSRAM_SLOTS: 3,                         // deque(maxlen=3)

    /* --- analysis thresholds (applied to the de-quantised tensor) --- */
    CLOUD_LUM: 185,
    CLOUD_CHROMA: 30,
    EDGE_THRESHOLD: 90,
    BRIGHT_LUM: 225,

    psram: [],                              // the ring buffer itself
    lastTensor: null
  };

  /* ------------------------------------------------------------------
     1. INGEST — raw frame packet, as the Python module builds it
     ------------------------------------------------------------------ */
  api.ingest = function(canvas, meta){
    var packet = {
      id: meta.name,
      filename: meta.label || meta.name,
      canvas: canvas,
      width: canvas.width,
      height: canvas.height,
      rawBytes: canvas.width * canvas.height * 4,   // raw_img.nbytes (RGBA)
      tile: meta.tile,
      ts: Date.now()
    };
    return packet;
  };

  /* ------------------------------------------------------------------
     2. STAGE — append to the PSRAM ring; oldest falls out at capacity
     ------------------------------------------------------------------ */
  api.stage = function(packet){
    api.psram.push(packet);
    while (api.psram.length > api.PSRAM_SLOTS) api.psram.shift();
    return api.psram.length;
  };

  api.pop = function(){
    return api.psram.shift() || null;
  };

  api.psramBytes = function(){
    var t = 0;
    for (var i = 0; i < api.psram.length; i++) t += api.psram[i].rawBytes;
    return t;
  };

  /* ------------------------------------------------------------------
     3. TENSOR — cv2.resize(INTER_AREA) then INT8 quantisation
     ------------------------------------------------------------------ */
  function areaResize(srcCanvas, N){
    var w = srcCanvas.width, h = srcCanvas.height;
    var sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    var src = sctx.getImageData(0, 0, w, h).data;
    var out = new Uint8ClampedArray(N * N * 3);   // RGB, matches cv2 BGR→RGB at display
    var sx = w / N, sy = h / N;

    for (var y = 0; y < N; y++){
      var y0 = Math.floor(y * sy), y1 = Math.min(h, Math.ceil((y + 1) * sy));
      for (var x = 0; x < N; x++){
        var x0 = Math.floor(x * sx), x1 = Math.min(w, Math.ceil((x + 1) * sx));
        var r = 0, g = 0, b = 0, n = 0;
        for (var yy = y0; yy < y1; yy++){
          var idx = (yy * w + x0) * 4;
          for (var xx = x0; xx < x1; xx++, idx += 4){
            r += src[idx]; g += src[idx+1]; b += src[idx+2]; n++;
          }
        }
        var o = (y * N + x) * 3;
        out[o] = r / n; out[o+1] = g / n; out[o+2] = b / n;
      }
    }
    return out;
  }

  /* np.clip(x.astype(float32) - 128.0, -128, 127).astype(int8) */
  function quantise(rgb, N){
    var len = N * N * 3;
    var tensor = new Int8Array(len);
    for (var i = 0; i < len; i++){
      var v = rgb[i] - 128;
      tensor[i] = v < -128 ? -128 : v > 127 ? 127 : v;
    }
    return tensor;
  }

  /* inverse, for display and for feature extraction */
  function dequantise(tensor){
    var out = new Uint8ClampedArray(tensor.length);
    for (var i = 0; i < tensor.length; i++){
      var v = tensor[i] + 128;
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    return out;
  }

  api.toTensor = function(canvas){
    var N = api.TENSOR_RES;
    var rgb = areaResize(canvas, N);
    var tensor = quantise(rgb, N);
    return {
      tensor: tensor,
      res: N,
      bytes: tensor.length,               // int8_tensor.nbytes
      rgb: rgb
    };
  };

  /* tensor as a canvas — nearest-neighbour, so the INT8 grid is visible */
  api.tensorCanvas = function(tensor, N){
    var c = document.createElement('canvas');
    c.width = N; c.height = N;
    var g = c.getContext('2d');
    var img = g.createImageData(N, N);
    var px = dequantise(tensor);
    for (var p = 0; p < N * N; p++){
      var i = p * 4, j = p * 3;
      img.data[i] = px[j]; img.data[i+1] = px[j+1]; img.data[i+2] = px[j+2]; img.data[i+3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  };

  /* ------------------------------------------------------------------
     4. FEATURES — measured on the de-quantised tensor
     ------------------------------------------------------------------ */
  api.run = function(canvas){
    var t0 = util.now();
    var N = api.TENSOR_RES;
    var tot = N * N;

    var built = api.toTensor(canvas);
    var tensor = built.tensor;

    /* SRAM guard — the Python module raises MemoryError here */
    if (built.bytes > api.SRAM_LIMIT){
      var err = new Error('tensor ' + (built.bytes / 1048576).toFixed(2) +
                          ' MB breaches SRAM limit ' + (api.SRAM_LIMIT / 1048576).toFixed(2) + ' MB');
      err.code = 'SRAM_FAULT';
      err.tensorBytes = built.bytes;
      throw err;
    }
    api.lastTensor = built;

    var px = dequantise(tensor);
    var lum = new Float32Array(tot);
    var hist = new Uint32Array(256);
    var sum = 0, p, i, L;

    for (p = 0, i = 0; p < tot; p++, i += 3){
      L = 0.2126 * px[i] + 0.7152 * px[i+1] + 0.0722 * px[i+2];
      lum[p] = L; sum += L;
      hist[L < 0 ? 0 : L > 255 ? 255 : L | 0]++;
    }
    var mean = sum / tot;

    var vr = 0, t;
    for (p = 0; p < tot; p++){ t = lum[p] - mean; vr += t * t; }
    var std = Math.sqrt(vr / tot);

    var entropy = 0;
    for (i = 0; i < 256; i++){
      if (hist[i]){ var pr = hist[i] / tot; entropy -= pr * Math.log2(pr); }
    }

    var cloud = 0;
    var mask = new Uint8Array(tot);
    for (p = 0, i = 0; p < tot; p++, i += 3){
      var mx = Math.max(px[i], px[i+1], px[i+2]);
      var mn = Math.min(px[i], px[i+1], px[i+2]);
      if (lum[p] > api.CLOUD_LUM && (mx - mn) < api.CLOUD_CHROMA){ mask[p] = 1; cloud++; }
    }
    var cloudFrac = cloud / tot;

    var edges = 0;
    for (var y = 1; y < N - 1; y++){
      var row = y * N;
      for (var x = 1; x < N - 1; x++){
        var k = row + x;
        var gx = (lum[k-N+1] + 2*lum[k+1] + lum[k+N+1]) - (lum[k-N-1] + 2*lum[k-1] + lum[k+N-1]);
        var gy = (lum[k+N-1] + 2*lum[k+N] + lum[k+N+1]) - (lum[k-N-1] + 2*lum[k-N] + lum[k-N+1]);
        if (Math.sqrt(gx * gx + gy * gy) > api.EDGE_THRESHOLD) edges++;
      }
    }
    var edgeFrac = edges / tot;

    var bright = 0;
    for (p = 0; p < tot; p++) if (lum[p] > api.BRIGHT_LUM) bright++;

    var h32 = new Array(32).fill(0);
    for (i = 0; i < 256; i++) h32[i >> 3] += hist[i];

    return {
      mean: mean,
      std: std,
      entropy: entropy,
      cloudFrac: cloudFrac,
      edgeFrac: edgeFrac,
      brightFrac: bright / tot,
      hist32: h32,
      histMax: Math.max.apply(null, h32),
      mask: mask,
      maskRes: N,
      tensor: tensor,
      tensorBytes: built.bytes,
      tensorRes: N,
      quant: { offset: 128, min: -128, max: 127, dtype: 'int8' },
      ms: (util.now() - t0).toFixed(1)
    };
  };

  api.maskOverlay = function(mask, res){
    var N = res || api.TENSOR_RES;
    var c = document.createElement('canvas');
    c.width = N; c.height = N;
    var g = c.getContext('2d');
    var img = g.createImageData(N, N);
    for (var p = 0; p < N * N; p++){
      if (mask[p]){
        var i = p * 4;
        img.data[i] = 255; img.data[i+1] = 77; img.data[i+2] = 141; img.data[i+3] = 150;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  };

  return api;
})();
