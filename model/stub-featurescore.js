/* =====================================================================
   model/stub-featurescore.js — placeholder scorer
   ---------------------------------------------------------------------
   Not a trained model. A hand-tuned feature scorer that behaves the way
   the eventual model should: it reads the preprocessing vector and emits
   a relevance and a visibility score, both 0..100.

   relevance  — is there something worth looking at in this frame?
                structure (edges), information (entropy), unobscured area
   visibility — can an observer actually see it?
                clear-sky fraction, contrast, exposure

   Scores are computed from the feature vector, which preprocess measures on
   the de-quantised INT8 tensor — i.e. on exactly what a real TinyML model
   would receive at the SRAM scratchpad. ctx.tensor is available if you want
   to read the quantised bytes directly instead.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.model.stubFeaturescore = (function(){
  'use strict';

  var clamp = SAT.util.clamp;

  /* calibrated against the 18 tiles measured on the 160² INT8 tensor with
     the same 3x3 Sobel kernel preprocess uses: edge fraction runs
     0.017 (dunes) → 0.667 (Mississippi meanders), median 0.343.
     Do not calibrate this with a plain first difference — Sobel amplifies
     gradients roughly 4x and the number will look 4x too small. */
  var EDGE_NORM = 0.62;    // edge fraction that counts as maximally structured
  var ENTROPY_NORM = 8.0;  // bits
  var STD_NORM = 68;       // contrast

  return {
    id: 'stub-featurescore',
    version: '0.1.0',
    mode: 'local',

    async infer(f, meta, ctx){
      var e = clamp(f.edgeFrac / EDGE_NORM, 0, 1);
      var h = clamp(f.entropy / ENTROPY_NORM, 0, 1);
      var clear = 1 - f.cloudFrac;
      var brightScore = clamp(1 - Math.abs(f.mean - 118) / 118, 0, 1);
      var clearP = Math.pow(clear, 1.4);
      var contrast = clamp(f.std / STD_NORM, 0, 1);

      var relevance  = 100 * (0.45 * e + 0.25 * h + 0.30 * clear);
      var visibility = 100 * (0.50 * clearP + 0.30 * contrast + 0.20 * brightScore);

      return {
        relevance: relevance,
        visibility: visibility,
        terms: {
          e: e, h: h, clear: clear,
          rel: (0.45 * e).toFixed(3) + '+' + (0.25 * h).toFixed(3) + '+' + (0.30 * clear).toFixed(3),
          vis: (0.50 * clearP).toFixed(3) + '+' + (0.30 * contrast).toFixed(3) + '+' + (0.20 * brightScore).toFixed(3)
        }
      };
    }
  };
})();
