# Changelog

Every change ships as a tagged GitHub release so any point in the project's life
can be restored. Format follows [Keep a Changelog](https://keepachangelog.com/);
versions follow semver.

- **minor** bump — anything visible changes: layout, styling, new panel, new behaviour
- **patch** bump — bug fixes and internal changes with no visible difference

To roll back, either download the source of an earlier tag from the releases page,
or ask for a revert to it.

## [1.0.0] — baseline

The state the project is at when release tracking starts. Earlier work exists in
the commit history but was not tagged.

### Added
- `dataset/` — 18 public-domain satellite tiles (NASA / USGS / NOAA / ESA via
  Wikimedia Commons), fixed-order cycle with a deterministic crop offset per pass
- `preprocess/` — CubeSat ingress ported from `Cubesatsim_dataintake.py`: 3-slot
  PSRAM ring, area-average resize to 160², INT8 quantisation `clip(x−128, −128, 127)`,
  4.2 MB SRAM guard, features measured on the de-quantised tensor
- `model/` — connector registry plus a placeholder feature scorer, swappable at
  runtime or pointable at an HTTP endpoint
- `js/` — dashboard, storage policy (compress then evict on watermark), UI
- rotating orthographic Earth built from Natural Earth 110m coastlines
- ground-segment console layout: mission header, telemetry panels, event log,
  frame index

### Known
- the multi-file tree must be served over HTTP (`python3 serve.py`) — canvas pixel
  access is blocked on `file://`
- frame sizes are a real JPEG encode scaled to a nominal 1024² tile; re-encode
  sizes on compression use the encoder model `b = b₀·(q/q₀)^1.9`
