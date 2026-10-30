# model/

The scoring model has not been decided, so this folder is a seam rather than an
implementation. `index.js` is a registry and a dispatcher; it knows how to call a
connector, not what one does.

```
model/
├── index.js              registry + dispatcher (do not need to edit)
├── stub-featurescore.js  placeholder scorer, active by default
└── README.md
```

## The connector contract

```js
{
  id: 'my-model',
  version: '1.0.0',
  mode: 'local',
  async infer(features, meta) {
    return {
      relevance: 0..100,     // is there something worth keeping in this frame
      visibility: 0..100,    // can it actually be seen
      terms: { ... }         // optional, printed in the trace
    };
  }
}
```

`features` is whatever `SAT.preprocess.run()` returned. `meta` carries
`{ id, tile, label, seq }` for the frame being scored.

`terms`, if present, is used only for the verbose trace. Return three keys — `e`,
`h`, `clear` — plus two strings `rel` and `vis` showing the arithmetic. Omit it and
the trace simply skips those lines.

## Swapping in a real model

Drop a file next to this README:

```js
// model/my-model.js
SAT.model.register({
  id: 'resnet-relevance',
  version: '1.0.0',
  async infer(f) {
    const res = await fetch('/infer', {
      method: 'POST',
      body: JSON.stringify({ mean: f.mean, entropy: f.entropy, edgeFrac: f.edgeFrac })
    });
    const j = await res.json();
    return { relevance: j.relevance, visibility: j.visibility };
  }
}, true);   // true = activate immediately
```

Then add one line to `index.html`, after `model/index.js`:

```html
<script src="model/my-model.js"></script>
```

Or register it live from the browser console without touching any file.

## Pointing at a service instead

Settings → model connector → **endpoint**. The feature vector is POSTed as:

```json
{ "features": { "mean": 118.4, "std": 49.9, "entropy": 7.36,
                "cloudFrac": 0.0, "edgeFrac": 0.108, "brightFrac": 0.008,
                "tile": "pivot" } }
```

and the response must be `{ "relevance": 0..100, "visibility": 0..100 }`. Any
transport error, non-200 or malformed payload falls back to the active local
connector and logs the failure in the trace — the pipeline never stalls on a dead
endpoint.

## The placeholder

`stub-featurescore.js` is a hand-tuned formula, not a trained model:

```
relevance  = 100 · (0.45·edges + 0.25·entropy + 0.30·clear)
visibility = 100 · (0.50·clear^1.4 + 0.30·contrast + 0.20·exposure)
```

Its normalisation constants (`EDGE_NORM`, `ENTROPY_NORM`, `STD_NORM`) were calibrated
against the 18 tiles in `dataset/` so the scores spread across the range rather than
saturating near 100. If you add tiles with very different statistics, re-check those
constants first — otherwise every new tile will score the same and the ranking stops
telling you anything.

## Notes on scoring

Priority, the number the storage manager actually ranks on, is computed in
`js/app.js`:

```
priority = wRel · relevance + (1 − wRel) · visibility     // wRel from settings
```

so the connector's job is only to produce the two raw scores. Weighting is an
operator decision, not a model decision.
