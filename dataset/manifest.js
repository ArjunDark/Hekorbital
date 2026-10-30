/* =====================================================================
   dataset/manifest.js — the image set the simulator ingests
   ---------------------------------------------------------------------
   Every tile is a real, public-domain satellite scene (NASA / USGS /
   NOAA / ESA, sourced via Wikimedia Commons). Tiles are 384x384 crops
   of the original scene, saved as progressive JPEG.
   Add a tile by dropping a jpg in dataset/tiles/ and appending a row
   here. Nothing else needs to change.
   ===================================================================== */
window.SAT = window.SAT || {};

SAT.dataset = {
  root: 'dataset/',
  tileSize: 384,
  tiles: [
    { id: 'pivot',     label: 'pivot irrigation · Kansas, US',           category: 'agriculture', file: 'tiles/pivot.jpg',           title: 'Landsat sees crops in Kansas.jpg' },
    { id: 'dunes',     label: 'dunes · Sahara, Algeria',                 category: 'desert',      file: 'tiles/dunes.jpg',           title: 'ISS-64 Sahara Desert, Algeria.jpg' },
    { id: 'delta',     label: 'Nile delta · false colour',               category: 'delta',       file: 'tiles/delta.jpg',           title: 'Nile delta landsat false color.jpg' },
    { id: 'cyclone',   label: 'cyclone · Atlantic',                      category: 'cloud',       file: 'tiles/cyclone.jpg',         title: 'Dennis 2005-07-07 1550Z.jpg' },
    { id: 'night',     label: 'city lights · United States',             category: 'night',       file: 'tiles/night.jpg',           title: 'City Lights of the United States 2012.jpg' },
    { id: 'snow',      label: 'snowpack · Himalayas',                    category: 'snow',        file: 'tiles/snow.jpg',            title: 'Snow in the Himalayas (MODIS 2015-12-05).jpg' },
    { id: 'smoke',     label: 'smoke plume · GOES-16',                   category: 'smoke',       file: 'tiles/smoke.jpg',           title: 'Wildfire Smoke as viewed from GOES-16 2023-06-07 1206Z.jpg' },
    { id: 'coast',     label: 'coastline · UAE',                         category: 'coast',       file: 'tiles/coast.jpg',           title: 'ISS-42 Coastline of the United Arab Emirates.jpg' },
    { id: 'fields',    label: 'fields · Netherlands',                    category: 'agriculture', file: 'tiles/fields.jpg',          title: 'Tulip Fields, Netherlands (ASTER).jpg' },
    { id: 'river',     label: 'meanders · Mississippi',                  category: 'river',       file: 'tiles/river.jpg',           title: 'Meandering Mississippi (5182095595).jpg' },
    { id: 'ponds',     label: 'evaporation ponds · Utah',                category: 'mineral',     file: 'tiles/ponds.jpg',           title: 'ISS-52 Solar Evaporation Ponds near Moab, Utah.jpg' },
    { id: 'tokyo',     label: 'city lights · Tokyo',                     category: 'night',       file: 'tiles/tokyo.jpg',           title: 'ISS-62 Tokyo, Japan at night.jpg' },
    { id: 'mine',      label: 'open-pit mine · Escondida, Chile',        category: 'mine',        file: 'tiles/mine.jpg',            title: 'Escondida Mine, Chile (ASTER).jpg' },
    { id: 'flood',     label: 'flood · Pakistan 2010',                   category: 'flood',       file: 'tiles/flood.jpg',           title: '2010 Pakistan flood Khewali by Landsat-5 2010-08-09 big.jpg' },
    { id: 'greenhouse', label: 'greenhouses · Almería, Spain',            category: 'agriculture', file: 'tiles/greenhouse.jpg',      title: 'Almeria, Spain (ASTER).jpg' },
    { id: 'ash',       label: 'ash plume · Merapi',                      category: 'smoke',       file: 'tiles/ash.jpg',             title: 'Merapi ash plume MODIS sat image 10 Nov 2010.jpg' },
    { id: 'glacier',   label: 'glacier · Susitna, Alaska',               category: 'ice',         file: 'tiles/glacier.jpg',         title: 'Susitna Glacier, Alaska crop.jpg' },
    { id: 'seoul',     label: 'urban · Seoul, false colour',             category: 'urban',       file: 'tiles/seoul.jpg',           title: 'Large Seoul Landsat.jpg' }
  ]
};

SAT.dataset.byId = function(id){
  return SAT.dataset.tiles.filter(function(t){ return t.id === id; })[0] || null;
};
