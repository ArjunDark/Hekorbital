/* =====================================================================
   model/index.js — the model connector seam
   ---------------------------------------------------------------------
   The scoring model has not been chosen yet, so this file is deliberately
   only a registry and a dispatcher. It knows how to call a connector; it
   does not know what a connector does internally.

   A connector is:
     { id, version, mode, async infer(features, meta, ctx) -> {relevance, visibility, terms?} }

   ctx carries the INT8 tensor itself — { tensor: Int8Array, tensorBytes, tensorRes } —
   so a real TinyML model can score the quantised input directly, exactly what the
   SRAM scratchpad hands it. Connectors that only need the statistics can ignore it.
   both scores in 0..100. `terms` is optional and only used to print the
   arithmetic in the trace.

   Swap the active connector at runtime:
     SAT.model.register(SAT.model.connectors['my-model'])
   or, from the console, with an inline object.

   Point it at a real service instead:
     settings → model → endpoint = http://localhost:8000/score
   The feature vector is POSTed as { features: {...} } and the response
   must be { relevance, visibility }. Failures fall back to local scoring.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.model = (function(){
  'use strict';

  var util = SAT.util;

  var api = {
    VERSION: '1.0.0',
    connectors: {},
    active: null,
    onChange: null
  };

  /** register a connector under its id; optionally activate it */
  api.register = function(connector, activate){
    if (!connector || typeof connector.infer !== 'function'){
      if (SAT.log) SAT.log('ERR', 'connector needs an async infer(features) method', 'err');
      return false;
    }
    if (!connector.id) connector.id = 'anonymous';
    api.connectors[connector.id] = connector;
    if (activate || !api.active){
      api.active = connector;
      if (api.onChange) api.onChange(connector);
      if (SAT.log) SAT.log('MODEL', 'connector <b>' + util.esc(connector.id) + '</b>/' +
                                   util.esc(connector.version || '?'), 'warn');
    }
    return true;
  };

  api.describe = function(){
    var c = api.active || {};
    return { id: c.id || 'none', version: c.version || '?', mode: SAT.cfg.endpoint ? 'remote' : 'local' };
  };

  /**
   * Run one inference. Honours the endpoint setting, then falls back to
   * the local connector on any transport error.
   */
  api.infer = async function(features, meta, ctx){
    var t0 = util.now(), out;

    if (SAT.cfg.endpoint){
      try {
        var payload = {
          features: {
            mean: features.mean,
            std: features.std,
            entropy: features.entropy,
            cloudFrac: features.cloudFrac,
            edgeFrac: features.edgeFrac,
            brightFrac: features.brightFrac,
            tile: meta.tile
          },
          tensor: ctx ? { res: ctx.tensorRes, bytes: ctx.tensorBytes, dtype: 'int8' } : null
        };
        var res = await fetch(SAT.cfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var j = await res.json();
        out = { relevance: +j.relevance, visibility: +j.visibility, terms: null };
        if (!isFinite(out.relevance) || !isFinite(out.visibility)) throw new Error('bad payload');
      } catch (err){
        if (SAT.log) SAT.log('ERR', 'endpoint failed (' + util.esc(err.message) + ') — local fallback', 'err');
        out = await api.active.infer(features, meta, ctx);
      }
    } else {
      out = await api.active.infer(features, meta, ctx);
    }

    if (SAT.cfg.latency > 0) await util.sleep(SAT.cfg.latency * 0.35);
    out.ms = (util.now() - t0).toFixed(0);
    return out;
  };

  return api;
})();
