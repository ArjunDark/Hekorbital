# model

Two iterations of the onboard triage and downlink layer. Both are policy code:
they decide what a satellite transmits, in what order, and how many bytes each
item gets. Neither contains the vision backbone — that arrives separately as a
quantized ONNX file and plugs in through `CallableClassifier` (v1) or
`load_onnx` (v2).

| | What it is | Status |
|---|---|---|
| `v1_policy/` | Utility-per-byte allocator. Four gates, novelty ring, weather branch, knapsack allocator, pass scheduler. | Superseded |
| `v2_gate/` | Confidence-gating scheduler matching the brief: discard cloud, JSON alert above 95%, crop below it. Adds storm classification, temporal false-positive suppression, UI session state. | Current |

Nothing here needs training. `headline_train.py` calibrates thresholds against
38-Cloud; `headline_unet.py` and `headline_storms.py` train small models. The
pruned and quantized backbone is the one piece not in this repository.

---

## v1_policy — the first iteration

Built before the brief was known. It treats the problem as *value per byte*:
score every tile by `(1 − cloud) × novelty × (w₁I + w₂A + w₃R) / bytes`, then
fill the pass budget with the best value density, alerts first.

| File | Role |
|---|---|
| `headline_policy.py` | The layer. `StatsGate`, `NoveltyRing`, `WeatherBranch`, `UtilityModel`, `allocate`, `TriagePipeline`, `naive_pass` |
| `headline_io.py` | Reads the upstream `{"images":[{"filename","priority_score"}]}` file and runs the pipeline on it |
| `headline_train.py` | Calibrates the cloud threshold on 38-Cloud to a target false-positive rate |
| `headline_unet.py` | Small U-Net cloud-segmentation model, trained on 38-Cloud |
| `budget_model.py` | The arithmetic behind the deck: 629 MB captured, 17.3 MB per pass, 2.75% send ratio |
| `demo_headline.py` | Runs a pass and prints the comparison against the naive baseline |

Run it:

```bash
python demo_headline.py                     # works with no data on disk
python headline_train.py --root /path/to/38-Cloud --out headline_params.json
```

Why it was replaced: the brief does not ask for value maximisation, it asks for
a confidence gate at 95% and a crop queue below it. v1 also allocates on a
utility model the brief never mentions, and its novelty ring needs a stable
tile grid that a stitched-scene pipeline does not provide.

---

## v2_gate — the second iteration, aligned to the brief

Per tile, in this order:

1. a confident storm verdict → ship a 512-byte mask product (Class W)
2. cloud fraction ≥ 0.85 → ship a mask product anyway, full or 64-byte summary depending on internal texture
3. cloud fraction ≥ 0.80 → discard onboard, transmit nothing
4. detection confidence ≥ 0.95 → JSON coordinate alert, ~300 bytes
5. otherwise → queue a compressed crop for foundation-model verification

| File | Role |
|---|---|
| `headline_gate.py` | The scheduler. `GateConfig`, `Tile`, `run_pass`, `write_alerts`, `time_pass` |
| `headline_demo.py` | Single-image harness and the UI contract: `process_image`, `load_onnx`, `preview` |
| `headline_storms.py` | Builds a labelled storm dataset from published cyclone tracks and NASA GIBS, then trains a storm classifier and exports ONNX |
| `headline_temporal.py` | False-positive suppression: two looks at the same ground, static bright pixels removed, moving cloud kept |
| `headline_ui.py` | `Session` object returning every field the dashboard renders, including packet loss and latency |
| `headline_export.py` | Converts a Session into the JSON shape `SMART-TRIAGE_adv.html` expects, plus the JS bridge |

Run it:

```python
from headline_demo import load_onnx, process_image
model = load_onnx("model_int8.onnx", classes=[...])
print(process_image("tile.png", model))

from headline_gate import load_tiles, run_pass, GateConfig
res = run_pass(load_tiles("ai_priorities.json"), GateConfig())
print(res.metrics)
```

---

## Integration

The backbone enters in exactly one place:

```python
from headline_demo import load_onnx
model = load_onnx("model_int8.onnx", classes=["cloud_scene", "storm"])
```

Everything downstream takes `model` as a parameter. With `model=None` the code
falls back to a brightness threshold, so the whole pipeline runs and demos
before the backbone exists — the fallback's numbers are not results and should
not be quoted as such.

What the ONNX must come with:

- class names in output index order
- input size, channel order, and whether values are 0–1 or 0–255
- whether normalisation is inside the graph
- accuracy for fp32 and int8 on the same held-out set, for the retention figure

---

## Dependencies

```
numpy pillow requests
torch            # training and ONNX export only
onnx onnxruntime # export and inference
```

---

## Known gaps

- **Pruning and INT8 quantization are not here.** The brief asks for iterative
  L2-norm filter pruning followed by static quantization; that pipeline lives
  with the backbone and is the largest outstanding item.
- **Peak RAM is arithmetic, not measured.** The 575 KB figure in the deck is a
  budget, not a measurement from a running model.
- **Class W is a dense-cloud product, not a cyclone classifier**, unless
  `headline_storms.py` has been trained and its ONNX is loaded. Without it the
  gate ships masks for any tile above 85% cloud.
- **The temporal check needs two looks at the same ground.** Given two unrelated
  images it will still return a number, and that number is meaningless. Check
  that `shift` is not pinned at the search limit before trusting it.
