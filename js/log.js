/* =====================================================================
   js/log.js — the trace panel
   Keeps only as many lines as fit the panel, so nothing ever scrolls.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.log = (function(){
  'use strict';

  var util = SAT.util;
  var el = null, count = 0;

  function panel(){
    if (!el) el = util.$('#trace');
    return el;
  }

  function maxLines(){
    var p = panel();
    var h = p ? (p.clientHeight || 300) : 300;
    return Math.max(3, Math.floor(h / 13));
  }

  /**
   * @param {string} tag   INGEST | SRAM | PRE | MODEL | COMMIT | GC | SYS | ERR
   * @param {string} msg   may contain <b>, <em>, <u>, <i> for emphasis
   * @param {string} [cls] 'warn' | 'err'
   */
  function log(tag, msg, cls){
    var p = panel();
    if (!p) return;
    var t = ((util.now() - SAT.state.t0) / 1000).toFixed(1).padStart(5, ' ');
    var div = document.createElement('div');
    div.className = 'ln' + (cls ? ' ' + cls : '');
    div.innerHTML = '<span class="t">' + t + '</span>'
                  + '<span class="tag ' + tag + '">' + tag + '</span>'
                  + '<span class="msg">' + msg + '</span>';
    p.appendChild(div);
    count++;
    var cap = maxLines();
    while (count > cap && p.firstElementChild){
      p.firstElementChild.remove();
      count--;
    }
  }

  log.clear = function(){
    var p = panel();
    if (p) p.innerHTML = '';
    count = 0;
  };
  log.count = function(){ return count; };

  return log;
})();
