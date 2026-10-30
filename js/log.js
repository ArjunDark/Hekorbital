/* =====================================================================
   js/log.js — event log
   Ground-segment log format: timestamp, severity, source, message.
   Keeps only as many lines as fit, so the panel never scrolls.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.log = (function(){
  'use strict';

  var util = SAT.util;
  var el = null, count = 0;

  function panel(){
    if (!el) el = util.$('#log');
    return el;
  }

  function maxLines(){
    var p = panel();
    var h = p ? (p.clientHeight || 300) : 300;
    return Math.max(3, Math.floor(h / 13));
  }

  /* tag -> source column; cls -> severity column */
  var SEV = { err: 'FAULT', warn: 'WARN' };

  /**
   * @param {string} tag   INGEST | SRAM | PRE | MODEL | COMMIT | GC | SYS | ERR
   * @param {string} msg   may contain <b>, <em>, <u>, <i> for emphasis
   * @param {string} [cls] 'warn' | 'err' | 'ok'
   */
  function log(tag, msg, cls){
    var p = panel();
    if (!p) return;

    var t = new Date();
    var ts = String(t.getUTCHours()).padStart(2,'0') + ':' +
             String(t.getUTCMinutes()).padStart(2,'0') + ':' +
             String(t.getUTCSeconds()).padStart(2,'0') + '.' +
             String(t.getUTCMilliseconds()).padStart(3,'0');

    var sev = SEV[cls] || (cls === 'ok' ? 'OK' : 'INFO');

    var div = document.createElement('div');
    div.className = 'ln' + (cls ? ' ' + cls : '');
    div.innerHTML = '<span class="t">' + ts + '</span>'
                  + '<span class="sev ' + sev + '">' + sev + '</span>'
                  + '<span class="src">' + tag + '</span>'
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
