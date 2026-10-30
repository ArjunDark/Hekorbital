# preprocess/

Turns a captured frame into the feature vector the model consumes. All of it is
real pixel work on a 256² downsample of the frame.

## API

```js
const features = SAT.preprocess.run(canvas);
```

| field | meaning |
| --- | --- |
| `mean` | mean luminance, 0–255 |
| `std` | luminance standard deviation (contrast) |
| `entropy` | Shannon entropy of the 256-bin luminance histogram, bits |
| `cloudFrac` | fraction of pixels matching the cloud mask |
| `edgeFrac` | fraction of pixels with Sobel magnitude above threshold |
| `brightFrac` | fraction of pixels above the bright threshold |
| `hist32` / `histMax` | 32-bin histogram for the preview strip |
| `mask` | `Uint8Array`, one flag per pixel of the 256² analysis grid |
| `ms` | wall time of the pass |

Also exported:

```js
SAT.preprocess.maskOverlay(mask)  // → canvas, magenta cloud overlay
```

## Tunables

Read at call time, so they can be changed from the console:

```js
SAT.preprocess.DOWNSCALE = 256;      // analysis resolution
SAT.preprocess.CLOUD_LUM = 185;      // luminance above which a pixel may be cloud
SAT.preprocess.CLOUD_CHROMA = 30;    // max channel spread still counted as cloud
SAT.preprocess.EDGE_THRESHOLD = 90;  // Sobel magnitude that counts as an edge
SAT.preprocess.BRIGHT_LUM = 225;     // bright-spot threshold
```

## Why these particular measures

They are cheap enough to run per frame in a browser and each maps to something the
model is expected to care about:

- **edges** — is there structure (fields, coastlines, roads) or just smooth water and sand
- **entropy** — how much information is in the frame at all
- **cloud mask** — how much of the frame is obscured; drives both relevance and visibility
- **contrast and mean luminance** — can the target actually be seen (haze, night, overexposure)

If the eventual model wants different features, this is the file to change — nothing
downstream assumes the current set, because the connector receives whatever object
`run()` returns.

## Adding a feature

Compute it inside `run()`, add it to the returned object, and it will reach the
connector. If it should also reach an HTTP endpoint, add it to the `body` payload in
`model/index.js → infer`.
