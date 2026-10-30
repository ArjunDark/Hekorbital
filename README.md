# SAT-IMG-PIPE

A simulator for the onboard imaging pipeline of a small satellite: capture a frame,
stage it in a 3-slot PSRAM ring, quantise it into a 160² INT8 tensor on a 4.2 MB SRAM
scratchpad, score it with a (still undecided) model, commit it to mass memory, and
watch the storage manager compress and evict frames as the store fills.

The ingress stage is a browser port of `preprocess/reference/Cubesatsim_dataintake.py`
— the Python module is the source of truth, `preprocess/index.js` mirrors it.

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
│   ├── log.js              event log (UTC · severity · source)
│   ├── earth.js            rotating orthographic Earth
│   ├── earth-data.js       Natural Earth 110m coastlines, simplified
│   ├── stage.js            payload-chain connectors, packets, node flashes
│   ├── storage.js          PSRAM ring, mass memory, GC policy
│   ├── ui.js               telemetry panels, frame view, index table, config
│   └── app.js              acquisition, the cycle, the clock
├── dataset/                ← the image set  (manifest.js + tiles/*.jpg)
├── preprocess/             ← CubeSat ingress: PSRAM ring, INT8 tensor, SRAM guard
│   └── reference/          ← Cubesatsim_dataintake.py, unmodified
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

## Interface

Presented as a diegetic terminal: phosphor mint on black, hairline rules, corner
brackets on framed images, dotted leaders between label and value, `›` prompts on
log lines and list items, hatched dividers and a hatched progress bar, vertical
edge captions. Frames are shown as phosphor duotone (luminance preserved, hue and
saturation forced to the terminal colour) so the imagery reads like the rest of the
display.

The mission header carries MET / UTC / mode / counters; the spacecraft view holds
the payload chain across its top, the spacecraft above a rotating Earth; the
terminal column carries the scan log, the raw/tensor frame pair, scan progress and
the readout table; the frame index runs along the bottom. Nothing scrolls — row
counts and log depth are computed from the space available.

The centre view draws the spacecraft over a rotating orthographic Earth built from
real Natural Earth coastlines (2.4°/s, one revolution per 150 s). The ground-station
marker is a real point on the globe — it rotates with the planet and is only drawn,
with its dashed uplink, while it is on the visible hemisphere. Everything else in
that view is a readout of actual pipeline state: a packet only moves along a
connector because the corresponding stage fired.

Colour is reserved for status. Nothing glows, nothing animates for decoration.

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

**`preprocess/`** — the ingress path. `ingest` → `stage` → `run`, mirroring the Python
module step for step: 3-slot PSRAM ring, area-average resize to 160², INT8
quantisation (`clip(x−128, −128, 127)`), 4.2 MB SRAM guard, features measured on the
de-quantised tensor. Raising the tensor resolution in settings past ~1210 px makes the
guard fire, which is the `MemoryError` branch of the Python module.

**`model/`** — the scorer. The model has not been chosen, so this folder holds a
registry plus a placeholder feature scorer. Swapping in a real model is one call.
See `model/README.md`.

## What is real and what is modelled

- **Real:** the frames (public-domain satellite imagery), the ingress path (PSRAM
  ring, area resize, INT8 quantisation, SRAM guard — same arithmetic as the Python
  module), the feature extraction (every statistic computed from the tensor), the JPEG
  encode sizes, the ranking, the GC decisions.
- **Modelled:** frame sizes are reported at a nominal 1024² tile, scaled from the
  384² working tile. Re-encode sizes during compression use
  `b = b₀ · (q/q₀)^1.9` rather than a second encode. Both are labelled in the trace.
- **Placeholder:** the scoring model. `stub-featurescore` is a hand-tuned formula,
  not a trained network.

## Imagery

All 18 tiles are public-domain satellite scenes from NASA, USGS, NOAA and ESA,
sourced via Wikimedia Commons. Individual credits are listed in
`dataset/README.md` and in the settings panel.
