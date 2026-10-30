/* =====================================================================
   js/earth.js — rotating orthographic Earth
   ---------------------------------------------------------------------
   Real coastlines (Natural Earth 110m, see js/earth-data.js) projected
   orthographically and rotated about the polar axis. Drawn on a canvas
   behind the SVG stage.

   Exposes SAT.earth.init(canvas) and SAT.earth.draw(tMs).
   The ground-station marker is a real point on the globe: it rotates with
   the planet and is only drawn while it is on the visible hemisphere,
   which is what an operator would actually see.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.earth = (function(){
  'use strict';

  var cv = null, ctx = null, W = 0, H = 0, dpr = 1;

  /* --- site --- */
  var GS_LON = 77.2;      // ground station longitude, deg E
  var GS_LAT = 28.6;      // latitude, deg N
  var TILT = 18;          // view inclination, deg

  var DEG = Math.PI / 180;
  var SPIN_DPS = 2.4;     // degrees of rotation per second (~150 s / rev)

  function project(lon, lat, lam0, cx, cy, R){
    var lr = (lon - lam0) * DEG, pr = lat * DEG, p0 = TILT * DEG;
    var cosc = Math.sin(p0) * Math.sin(pr) + Math.cos(p0) * Math.cos(pr) * Math.cos(lr);
    var x = Math.cos(pr) * Math.sin(lr);
    var y = Math.cos(p0) * Math.sin(pr) - Math.sin(p0) * Math.cos(pr) * Math.cos(lr);
    if (cosc < 0){
      /* behind the limb: pin to the rim so rings stay closed */
      var m = Math.sqrt(x * x + y * y) || 1;
      x /= m; y /= m;
    }
    return { x: cx + R * x, y: cy - R * y, vis: cosc >= 0 };
  }

  function resize(){
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init(canvas){
    cv = canvas;
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function drawRings(rings, lam0, cx, cy, R, fill, stroke){
    ctx.beginPath();
    for (var i = 0; i < rings.length; i++){
      var ring = rings[i], n = ring.length;
      var started = false;
      for (var j = 0; j < n; j += 2){
        var p = project(ring[j], ring[j + 1], lam0, cx, cy, R);
        if (!started){ ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    }
    if (fill){ ctx.fillStyle = fill; ctx.fill(); }
    if (stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = 0.6; ctx.stroke(); }
  }

  function drawGraticule(lam0, cx, cy, R){
    ctx.strokeStyle = 'rgba(150,220,185,0.10)';
    ctx.lineWidth = 0.6;
    var step = 30, k, a, b, started, p;

    /* meridians */
    for (var lon = -180; lon < 180; lon += step){
      ctx.beginPath(); started = false;
      for (var lat = -90; lat <= 90; lat += 4){
        p = project(lon, lat, lam0, cx, cy, R);
        if (!p.vis){ started = false; continue; }
        if (!started){ ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    /* parallels */
    for (var la = -60; la <= 60; la += step){
      ctx.beginPath(); started = false;
      for (var lo = -180; lo <= 180; lo += 4){
        p = project(lo, la, lam0, cx, cy, R);
        if (!p.vis){ started = false; continue; }
        if (!started){ ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  function draw(tMs){
    if (!ctx) return;
    var lam0 = -(tMs / 1000) * SPIN_DPS % 360;
    var cx = W / 2;
    /* the canvas is the stage box, whose coordinates match the SVG viewBox
       1000x640, so the globe sits at a known place relative to the spacecraft */
    var R = Math.min(W * 0.17, H * 0.30);
    var cy = H * (520 / 640);

    ctx.clearRect(0, 0, W, H);

    /* ocean sphere with limb shading */
    var g = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.34, R * 0.1, cx, cy, R * 1.02);
    g.addColorStop(0, '#0c1f16');
    g.addColorStop(0.62, '#071310');
    g.addColorStop(1, '#030806');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    /* land */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    if (SAT.earthData) drawRings(SAT.earthData, lam0, cx, cy, R, '#153526', 'rgba(140,220,180,0.30)');
    drawGraticule(lam0, cx, cy, R);
    ctx.restore();

    /* limb */
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(150,220,185,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* --- ground station --- */
    var gs = project(GS_LON, GS_LAT, lam0, cx, cy, R);
    if (gs.vis){
      /* dashed uplink/downlink toward the spacecraft */
      var anchorY = H * 0.50;
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(185,242,210,0.40)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gs.x, gs.y);
      ctx.lineTo(cx, anchorY);
      ctx.stroke();
      ctx.restore();

      /* site marker */
      ctx.beginPath();
      ctx.arc(gs.x, gs.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#b9f2d2';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gs.x, gs.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(185,242,210,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(185,242,210,0.85)';
      ctx.fillText('GS-1', gs.x + 10, gs.y - 6);
      return { visible: true, x: gs.x, y: gs.y };
    }

    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(92,143,119,0.7)';
    ctx.fillText('GS-1 BELOW HORIZON', 16, H - 26);
    return { visible: false };
  }

  return { init: init, draw: draw, resize: resize };
})();
