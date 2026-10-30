# dataset/

The image set the simulator ingests. Nothing here is generated — every tile is a
real satellite scene, cropped to 384×384 and saved as a progressive JPEG.

## Adding a tile

1. Put a square JPEG in `dataset/tiles/`.
2. Add a row to `manifest.js`:

```js
{ id: 'myTile', label: 'what it shows', category: 'agriculture', file: 'tiles/myTile.jpg',
  title: 'source file name' }
```

3. Reload. The tile appears in the settings tile picker and in the cycle.

Tiles are ingested in manifest order when the tile selector is set to *cycle all*.
Each pass through the set applies a deterministic crop offset (0/3/6/9 px) so a
revisited tile is not byte-identical to the previous pass — that keeps the ranking
and the GC moving instead of freezing on a fixed set of scores.

## Size

Tiles are 384² on disk and reported at a nominal 1024² in the UI, because that is the
resolution a real Sentinel/Landsat tile would be cut at. The scale factor is
`SAT.NATIVE_RES / SAT.dataset.tileSize` squared, applied in
`js/storage.js → encodeBytes`.

## Manifest format

| field | meaning |
| --- | --- |
| `id` | short identifier, also used in frame ids |
| `label` | human-readable description shown in the picker |
| `category` | free-text class (agriculture, night, cloud, …) |
| `file` | path relative to `dataset/` |
| `title` | original source file name, used for credits |

## Credits

All tiles are public domain, sourced via Wikimedia Commons (NASA / USGS / NOAA / ESA).

| id | shows | category | source file |
| --- | --- | --- | --- |
| `pivot` | pivot irrigation · Kansas, US | agriculture | Landsat sees crops in Kansas.jpg |
| `dunes` | dunes · Sahara, Algeria | desert | ISS-64 Sahara Desert, Algeria.jpg |
| `delta` | Nile delta · false colour | delta | Nile delta landsat false color.jpg |
| `cyclone` | cyclone · Atlantic | cloud | Dennis 2005-07-07 1550Z.jpg |
| `night` | city lights · United States | night | City Lights of the United States 2012.jpg |
| `snow` | snowpack · Himalayas | snow | Snow in the Himalayas (MODIS 2015-12-05).jpg |
| `smoke` | smoke plume · GOES-16 | smoke | Wildfire Smoke as viewed from GOES-16 2023-06-07 1206Z.jpg |
| `coast` | coastline · UAE | coast | ISS-42 Coastline of the United Arab Emirates.jpg |
| `fields` | fields · Netherlands | agriculture | Tulip Fields, Netherlands (ASTER).jpg |
| `river` | meanders · Mississippi | river | Meandering Mississippi (5182095595).jpg |
| `ponds` | evaporation ponds · Utah | mineral | ISS-52 Solar Evaporation Ponds near Moab, Utah.jpg |
| `tokyo` | city lights · Tokyo | night | ISS-62 Tokyo, Japan at night.jpg |
| `mine` | open-pit mine · Escondida, Chile | mine | Escondida Mine, Chile (ASTER).jpg |
| `flood` | flood · Pakistan 2010 | flood | 2010 Pakistan flood Khewali by Landsat-5 2010-08-09 big.jpg |
| `greenhouse` | greenhouses · Almería, Spain | agriculture | Almeria, Spain (ASTER).jpg |
| `ash` | ash plume · Merapi | smoke | Merapi ash plume MODIS sat image 10 Nov 2010.jpg |
| `glacier` | glacier · Susitna, Alaska | ice | Susitna Glacier, Alaska crop.jpg |
| `seoul` | urban · Seoul, false colour | urban | Large Seoul Landsat.jpg |
