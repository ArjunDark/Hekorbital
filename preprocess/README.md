# preprocess/

The CubeSat ingress and preprocessing stage. It is a browser port of
`reference/Cubesatsim_dataintake.py` — same three steps, same order, same numbers.

```
raw frame ──► PSRAM ring (3 slots) ──► area-average resize ──► INT8 quantise
                                              │
                                              ├─► 4.2 MB SRAM guard
                                              │
                                              └─► features measured on the tensor
```

## Mapping to the Python module

| Python (`CubeSatIngressModule`) | here (`SAT.preprocess`) |
| --- | --- |
| `process_sensor_frame(image_path)` | `run(canvas)` |
| `target_tensor_res=(160,160)` | `TENSOR_RES` (default 160) |
| `sram_limit_mb=4.2` | `SRAM_LIMIT` |
| `max_psram_slots=3` | `PSRAM_SLOTS` |
| `deque(maxlen=3)` | `psram[]` ring, oldest falls out |
| `cv2.resize(..., INTER_AREA)` | `areaResize()` — box filter over the source pixels each destination pixel covers |
| `np.clip(x-128.0, -128, 127).astype(int8)` | `quantise()` — `Int8Array` |
| `raise MemoryError(...)` on SRAM breach | throws `Error` with `code = 'SRAM_FAULT'` |
| `visualize_memory_footprint()` | the PSRAM / SRAM split view in the FRAME panel |

The tensor is 160 × 160 × 3 = **76,800 bytes**, which is what the Python module
reports as `int8_tensor.nbytes` and what the SRAM bar shows.

## API

```js
const packet = SAT.preprocess.ingest(canvas, meta);  // raw frame packet
SAT.preprocess.stage(packet);                        // push onto the ring
const packet = SAT.preprocess.pop();                 // oldest packet
const feats  = SAT.preprocess.run(packet.canvas);    // tensor + features
```

`run()` returns:

| field | meaning |
| --- | --- |
| `tensor` | `Int8Array`, length `res²·3`, values −128…127 |
| `tensorBytes` | `tensor.length` — the SRAM footprint |
| `tensorRes` | edge length used for this frame |
| `quant` | `{ offset: 128, min: -128, max: 127, dtype: 'int8' }` |
| `mean`, `std` | luminance statistics of the de-quantised tensor |
| `entropy` | Shannon entropy of its 256-bin histogram |
| `cloudFrac` | fraction matching the cloud mask |
| `edgeFrac` | fraction above the Sobel threshold |
| `brightFrac` | fraction above the bright threshold |
| `hist32`, `histMax` | histogram for the preview strip |
| `mask` | `Uint8Array` at `tensorRes²` |
| `ms` | wall time of the pass |

Also exported: `tensorCanvas(tensor, res)` — renders the tensor to a canvas for the
SRAM side of the preview, and `maskOverlay(mask, res)` for the cloud overlay.

## Why features are measured on the tensor

The point of the module is that the tensor is what a TinyML model receives. Measuring
statistics on a separate higher-resolution copy would describe pixels the model never
sees. So everything downstream — relevance, visibility, the ranking — is computed from
the de-quantised INT8 tensor at `TENSOR_RES`.

The practical consequence: raising `TENSOR_RES` in settings changes the scores as well
as the footprint, because edge density and entropy are resolution-dependent. At 160²
the tiles score a little differently than they did at the old 256² analysis grid.

## Tunables

Read at call time:

```js
SAT.preprocess.TENSOR_RES    = 160;       // SRAM scratchpad edge
SAT.preprocess.PSRAM_SLOTS   = 3;         // ring depth
SAT.preprocess.CLOUD_LUM     = 185;
SAT.preprocess.CLOUD_CHROMA  = 30;
SAT.preprocess.EDGE_THRESHOLD= 90;
SAT.preprocess.BRIGHT_LUM    = 225;
```

## Watching the SRAM guard fire

Set the tensor resolution to **1400** in settings (1400² × 3 = 5.61 MB). Every frame
then breaches the 4.2 MB limit, the trace logs `SRAM fault — tensor 5.61 MB breaches
SRAM limit 4.20 MB`, and the frame is dropped instead of committed. That is the
`MemoryError` branch of the Python module, wired to the UI.

## reference/

`Cubesatsim_dataintake.py` is the original module, unmodified. It is the source of
truth for this stage — if the two ever disagree, the Python wins and this file is the
bug.
