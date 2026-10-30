/* =====================================================================
   js/stage.js — the SVG stage
   Flow paths, travelling packets, node flashes and the backdrop.
   A packet only exists because a pipeline stage actually fired, so the
   diagram is a readout of real events, not a decorative loop.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.stage = (function(){
  'use strict';

  var util = SAT.util;
  var PATH_IDS = ['ingest', 'sram', 'pre', 'model', 'commit'];
  var paths = {};
  var packets = [];
  var layer = null;

  function init(){
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    util.$('#stage').appendChild(layer);

    PATH_IDS.forEach(function(id){
      var el = document.getElementById('path-' + id);
      if (el) paths[id] = { el: el, len: el.getTotalLength(), active: 0 };
    });
    backdrop();
  }

  function send(pathId, color){
    var p = paths[pathId];
    if (!p || !layer) return;
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', '3.2');
    c.setAttribute('fill', color);
    c.setAttribute('opacity', '0.95');
    layer.appendChild(c);
    packets.push({ node: c, path: p, t: 0, dur: 0.62 });
    p.active = util.now();
    p.el.setAttribute('stroke', color);
    p.el.setAttribute('stroke-opacity', '0.85');
    p.el.setAttribute('stroke-dasharray', '4 4');
  }

  function tick(dtMs){
    for (var i = packets.length - 1; i >= 0; i--){
      var pk = packets[i];
      pk.t += (dtMs / 1000) / pk.dur;
      if (pk.t >= 1){ pk.node.remove(); packets.splice(i, 1); continue; }
      var pt = pk.path.el.getPointAtLength(pk.path.len * pk.t);
      pk.node.setAttribute('cx', pt.x);
      pk.node.setAttribute('cy', pt.y);
      pk.node.setAttribute('opacity', (0.95 * (1 - Math.pow(pk.t, 3))).toFixed(2));
    }

    var t = util.now();
    PATH_IDS.forEach(function(id){
      var p = paths[id];
      if (!p) return;
      if (t - p.active > 700){
        p.el.setAttribute('stroke', '#2a3350');
        p.el.setAttribute('stroke-opacity', '1');
        p.el.setAttribute('stroke-dasharray', '0');
      } else {
        p.el.setAttribute('stroke-dashoffset', String((-(t - p.active) / 26) % 8));
      }
    });
  }

  function flash(nodeSel){
    var g = util.$(nodeSel);
    if (!g) return;
    var rect = g.querySelector('rect');
    if (!rect) return;
    rect.setAttribute('stroke', '#3fd8d8');
    setTimeout(function(){ rect.setAttribute('stroke', '#2b3552'); }, 260);
  }

  function led(sel, cls){
    var el = util.$(sel);
    if (!el) return;
    el.setAttribute('fill',
      cls === 'on'   ? '#7fdc86' :
      cls === 'busy' ? '#ffb454' :
      cls === 'crit' ? '#ff4d8d' : '#454e63');
  }

  /* fixed-seed starfield + horizon grid, drawn once */
  function backdrop(){
    var NS = 'http://www.w3.org/2000/svg';
    var stars = util.$('#stars');
    var s = 90210;
    function rnd(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }

    for (var i = 0; i < 120; i++){
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', (rnd() * 1000).toFixed(1));
      c.setAttribute('cy', (rnd() * 430).toFixed(1));
      c.setAttribute('r', (rnd() * 1.1 + 0.25).toFixed(2));
      c.setAttribute('fill', rnd() > 0.82 ? '#9d8bff' : '#c6cfe0');
      c.setAttribute('opacity', (0.12 + rnd() * 0.45).toFixed(2));
      stars.appendChild(c);
    }

    var grid = util.$('#perspGrid');
    for (var k = 0; k <= 16; k++){
      var x = 500 + (k - 8) * 62;
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', 500); l.setAttribute('y1', 470);
      l.setAttribute('x2', x * 2.6 - 500 * 1.6); l.setAttribute('y2', 600);
      l.setAttribute('stroke', 'rgba(255,77,141,.16)');
      l.setAttribute('stroke-width', '1');
      grid.appendChild(l);
    }
    for (var j = 1; j <= 7; j++){
      var y = 470 + Math.pow(j / 7, 2.1) * 130;
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', 0); ln.setAttribute('y1', y);
      ln.setAttribute('x2', 1000); ln.setAttribute('y2', y);
      ln.setAttribute('stroke', 'rgba(63,216,216,.10)');
      ln.setAttribute('stroke-width', '1');
      grid.appendChild(ln);
    }
  }

  return { init: init, send: send, tick: tick, flash: flash, led: led };
})();
