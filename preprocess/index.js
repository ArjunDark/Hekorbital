/* =====================================================================
   preprocess/index.js — the preprocessing stage
   ---------------------------------------------------------------------
   Takes a captured frame and turns it into the feature vector the model
   connector consumes. Everything here is real pixel work: a bilinear
   downscale, luminance statistics, a 256-bin histogram, a cloud mask,
   a Sobel edge count and a bright-pixel count.

   The thresholds are properties on SAT.preprocess so they can be tuned
   without touching the pipeline:  SAT.preprocess.CLOUD_LUM = 190
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.preprocess = (function(){
  'use strict';

  var util = SAT.util;

  var api = {
    VERSION: '1.0.0',
    DOWNSCALE: 256,       // analysis resolution
    CLOUD_LUM: 185,       // luminance above which a pixel may be cloud
    CLOUD_CHROMA: 30,     // max (max-min) channel spread to still count as cloud
    EDGE_THRESHOLD: 90,   // sobel magnitude that counts as an edge
    BRIGHT_LUM: 225       // luminance above which a pixel is a bright spot
  };

  /* one reusable canvas — analysis runs once per frame */
  var cv = document.createElement('canvas');
  cv.width = api.DOWNSCALE;
  cv.height = api.DOWNSCALE;
  var ctx = cv.getContext('2d', { willReadFrequently: true });

  /**
   * @param {HTMLCanvasElement} srcCanvas captured frame
   * @returns {object} features
   */
  api.run = function(srcCanvas){
    var t0 = util.now();
    var N = api.DOWNSCALE, tot = N * N;

    ctx.drawImage(srcCanvas, 0, 0, N, N);
    var d = ctx.getImageData(0, 0, N, N).data;

    /* --- luminance + histogram --- */
    var lum = new Float32Array(tot);
    var hist = new Uint32Array(256);
    var sum = 0, p, i, L;

    for (p = 0, i = 0; p < tot; p++, i += 4){
      L = 0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2];
      lum[p] = L;
      sum += L;
      hist[L < 0 ? 0 : L > 255 ? 255 : L | 0]++;
    }
    var mean = sum / tot;

    /* --- contrast --- */
    var vr = 0, t;
    for (p = 0; p < tot; p++){ t = lum[p] - mean; vr += t * t; }
    var std = Math.sqrt(vr / tot);

    /* --- entropy over the 256-bin histogram --- */
    var entropy = 0;
    for (i = 0; i < 256; i++){
      if (hist[i]){ var pr = hist[i] / tot; entropy -= pr * Math.log2(pr); }
    }

    /* --- cloud mask: bright and achromatic --- */
    var cloud = 0;
    var mask = new Uint8Array(tot);
    for (p = 0, i = 0; p < tot; p++, i += 4){
      var mx = Math.max(d[i], d[i+1], d[i+2]);
      var mn = Math.min(d[i], d[i+1], d[i+2]);
      if (lum[p] > api.CLOUD_LUM && (mx - mn) < api.CLOUD_CHROMA){ mask[p] = 1; cloud++; }
    }
    var cloudFrac = cloud / tot;

    /* --- sobel edge density --- */
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

    /* --- bright specular / thermal spots --- */
    var bright = 0;
    for (p = 0; p < tot; p++) if (lum[p] > api.BRIGHT_LUM) bright++;

    /* --- 32-bin histogram for the preview strip --- */
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
      ms: (util.now() - t0).toFixed(1)
    };
  };

  /* rendered overlay for the preview element */
  api.maskOverlay = function(mask){
    var N = api.DOWNSCALE;
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
