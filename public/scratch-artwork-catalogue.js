/** Reveal-approved scratch surface artwork: approved artwork supplied on 16 and 18 November 2026. */
export const SCRATCH_ARTWORKS = Object.freeze([
  {
    "id": "azure-kaleidoscope",
    "label": "Azure Kaleidoscope",
    "file": "Azure_Kaleidoscope.jpg"
  },
  {
    "id": "birthday-opulence",
    "label": "Birthday Opulence",
    "file": "Birthday_Opulence.jpg"
  },
  {
    "id": "champagne-currents",
    "label": "Champagne Currents",
    "file": "Champagne_Currents.jpg"
  },
  {
    "id": "champagne-ribbons",
    "label": "Champagne Ribbons",
    "file": "Champagne_Ribbons.jpg"
  },
  {
    "id": "compass-journey",
    "label": "Compass Journey",
    "file": "Compass_Journey.jpg"
  },
  {
    "id": "copper-petals",
    "label": "Copper Petals",
    "file": "Copper_Petals.jpg"
  },
  {
    "id": "crimson-vortex",
    "label": "Crimson Vortex",
    "file": "Crimson_Vortex.jpg"
  },
  {
    "id": "emerald-elegance",
    "label": "Emerald Elegance",
    "file": "Emerald_Elegance.jpg"
  },
  {
    "id": "festive-midnight",
    "label": "Festive Midnight",
    "file": "Festive_Midnight.jpg"
  },
  {
    "id": "fuchsia-prism",
    "label": "Fuchsia Prism",
    "file": "Fuchsia_Prism.jpg"
  },
  {
    "id": "gilded-archways",
    "label": "Gilded Archways",
    "file": "Gilded_Archways.jpg"
  },
  {
    "id": "golden-spotlight",
    "label": "Golden Spotlight",
    "file": "Golden_Spotlight.jpg"
  },
  {
    "id": "lunar-lullaby",
    "label": "Lunar Lullaby",
    "file": "Lunar_Lullaby.jpg"
  },
  {
    "id": "metallic-spirals",
    "label": "Metallic Spirals",
    "file": "Metallic_Spirals.jpg"
  },
  {
    "id": "midnight-romance",
    "label": "Midnight Romance",
    "file": "Midnight_Romance.jpg"
  },
  {
    "id": "ruby-diamonds",
    "label": "Ruby Diamonds",
    "file": "Ruby_Diamonds.jpg"
  },
  {
    "id": "sapphire-geometry",
    "label": "Sapphire Geometry",
    "file": "Sapphire_Geometry.jpg"
  },
  {
    "id": "sapphire-weave",
    "label": "Sapphire Weave",
    "file": "Sapphire_Weave.jpg"
  },
  {
    "id": "scarlet-waves",
    "label": "Scarlet Waves",
    "file": "Scarlet_Waves.jpg"
  },
  {
    "id": "silver-apex",
    "label": "Silver Apex",
    "file": "Silver_Apex.jpg"
  },
  {"id":"ruby-labyrinth","label":"Ruby Labyrinth","file":"Ruby_Labyrinth.webp"},
  {"id":"neon-apex","label":"Neon Apex","file":"Neon_Apex.webp"},
  {"id":"lime-vortex","label":"Lime Vortex","file":"Lime_Vortex.webp"},
  {"id":"neon-fuchsia","label":"Neon Fuchsia","file":"Neon_Fuchsia.webp"},
  {"id":"violet-currents","label":"Violet Currents","file":"Violet_Currents.webp"},
  {"id":"coral-prism","label":"Coral Prism","file":"Coral_Prism.webp"},
  {"id":"emerald-splash","label":"Emerald Splash","file":"Emerald_Splash.webp"},
  {"id":"sunset-geometry","label":"Sunset Geometry","file":"Sunset_Geometry.webp"},
  {"id":"sapphire-mosaic","label":"Sapphire Mosaic","file":"Sapphire_Mosaic.webp"},
  {"id":"graffiti-luxe","label":"Graffiti Luxe","file":"Graffiti_Luxe.webp"},
  {"id":"emerald-facets","label":"Emerald Facets","file":"Emerald_Facets.webp"},
  {"id":"copper-orbit","label":"Copper Orbit","file":"Copper_Orbit.webp"},
  {"id":"gilded-ribbons","label":"Gilded Ribbons","file":"Gilded_Ribbons.webp"},
  {"id":"magenta-spires","label":"Magenta Spires","file":"Magenta_Spires.webp"},
  {"id":"sapphire-trefoil","label":"Sapphire Trefoil","file":"Sapphire_Trefoil.webp"},
  {"id":"midnight-chevron","label":"Midnight Chevron","file":"Midnight_Chevron.webp"},
  {"id":"chromatic-weave","label":"Chromatic Weave","file":"Chromatic_Weave.webp"},
  {"id":"imperial-clover","label":"Imperial Clover","file":"Imperial_Clover.webp"},
  {"id":"rainbow-prism","label":"Rainbow Prism","file":"Rainbow_Prism.webp"},
  {"id":"violet-tunnel","label":"Violet Tunnel","file":"Violet_Tunnel.webp"}
].map(item=>Object.freeze({...item,src:'/scratch-artwork/'+item.file})));
export const DEFAULT_SCRATCH_ARTWORK = 'azure-kaleidoscope';
const byId=new Map(SCRATCH_ARTWORKS.map(item=>[item.id,item]));
export const isStudioScratchArtwork=id=>typeof id==='string'&&/^cover-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export const getScratchArtwork=id=>byId.get(id)||(isStudioScratchArtwork(id)?{id,label:'Saved scratch cover',src:'/api/scratch-artwork/'+id}:null);
