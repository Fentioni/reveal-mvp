/** Reveal-approved scratch surface artwork: exact files supplied on 16 November 2026. */
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
  }
].map(item=>Object.freeze({...item,src:'/scratch-artwork/'+item.file})));
export const DEFAULT_SCRATCH_ARTWORK = 'azure-kaleidoscope';
const byId=new Map(SCRATCH_ARTWORKS.map(item=>[item.id,item]));
export const isStudioScratchArtwork=id=>typeof id==='string'&&/^cover-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export const getScratchArtwork=id=>byId.get(id)||(isStudioScratchArtwork(id)?{id,label:'Saved scratch cover',src:'/api/scratch-artwork/'+id}:null);
