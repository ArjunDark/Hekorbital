/* =====================================================================
   js/stage.js — spacecraft view
   Connector paths across the payload chain, travelling packets, node
   highlights. A packet exists because a stage actually fired, so the
   diagram reads as telemetry rather than decoration.
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
  }

  function send(pathId, color){
    var p = paths[pathId];
    if (!p || !layer) return;
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', '2.6');
    c.setAttribute('fill', color);
    c.setAttribute('opacity', '0.95');
    layer.appendChild(c);
    packets.push({ node: c, path: p, t: 0, dur: 0.55 });
    p.active = util.now();
    p.el.setAttribute('stroke', color);
    p.el.setAttribute('stroke-opacity', '0.9');
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
      if (t - p.active > 600){
        p.el.setAttribute('stroke', '#2f5344');
        p.el.setAttribute('stroke-opacity', '1');
      }
    });
  }

  function flash(nodeSel){
    var g = util.$(nodeSel);
    if (!g) return;
    var rect = g.querySelector('rect');
    if (!rect) return;
    rect.setAttribute('stroke', '#7fb99e');
    setTimeout(function(){ rect.setAttribute('stroke', '#1b3a2e'); }, 240);
  }

  function led(sel, cls){
    var el = util.$(sel);
    if (!el) return;
    el.setAttribute('fill',
      cls === 'on'   ? '#7fb99e' :
      cls === 'busy' ? '#d9c07f' :
      cls === 'crit' ? '#e08d8d' : '#2f5344');
  }

  return { init: init, send: send, tick: tick, flash: flash, led: led };
})();
