# SAT-IMG-PIPE

A simulator for the onboard imaging pipeline of a small satellite: capture a frame,
stage it in a fixed 4.2 MB SRAM buffer, preprocess it, score it with a (still
undecided) model, commit it to mass memory, and watch the storage manager compress
and evict frames as the store fills.

Everything runs in the browser. No build step, no dependencies, no server-side code
beyond a static file server.

```
sat-img-pipe/
├── index.html              the dashboard
├── serve.py                static server (required — see below)
├── css/
│   └── styles.css
├── js/
│   ├── config.js           constants, defaults, shared state
│   ├── log.js              the trace panel
│   ├── stage.js            SVG flow paths, packets, node flashes
│   ├── storage.js          SRAM, mass memory, GC policy
│   ├── ui.js               device panels, preview, table, settings
│   └── app.js              acquisition, the cycle, the clock
├── dataset/                ← the image set  (manifest.js + tiles/*.jpg)
├── preprocess/             ← the preprocessing stage
└── model/                  ← the model connector
```

## Run it

```
cd sat-img-pipe
python3 serve.py
# open http://localhost:8000
```

**A server is required.** Opening `index.html` straight off disk (`file://`) makes the
browser taint every canvas the page draws an image into, and the preprocessing stage
reads those pixels. The page detects this at boot and says so instead of failing
silently.

## Controls

| key | action |
| --- | --- |
| `space` | hold / resume |
| `s` | step one cycle |
| `b` | burst of five |
| `t` | settings |
| `esc` | close settings |

Rate goes up to 4× from the top bar. With the defaults (16 MB store, 900 ms capture)
the high watermark is reached after roughly 40 frames.

## The three extension points

**`dataset/`** — the images. Drop a JPEG in `dataset/tiles/`, add a row to
`dataset/manifest.js`, done. See `dataset/README.md`.

**`preprocess/`** — the pixel work. `SAT.preprocess.run(canvas)` returns the feature
vector the model consumes. Thresholds are properties on the object, so they can be
retuned at runtime from the console.

**`model/`** — the scorer. The model has not been chosen, so this folder holds a
registry plus a placeholder feature scorer. Swapping in a real model is one call.
See `model/README.md`.

## What is real and what is modelled

- **Real:** the frames (public-domain satellite imagery), the preprocessing (every
  statistic is computed from pixels), the JPEG encode sizes, the ranking, the GC
  decisions.
- **Modelled:** frame sizes are reported at a nominal 1024² tile, scaled from the
  384² working tile. Re-encode sizes during compression use
  `b = b₀ · (q/q₀)^1.9` rather than a second encode. Both are labelled in the trace.
- **Placeholder:** the scoring model. `stub-featurescore` is a hand-tuned formula,
  not a trained network.

## Imagery

All 18 tiles are public-domain satellite scenes from NASA, USGS, NOAA and ESA,
sourced via Wikimedia Commons. Individual credits are listed in
`dataset/README.md` and in the settings panel.
