import {PAIRED_COVERS} from './paired-products.js';
export const SCRATCH_ARTWORKS=PAIRED_COVERS;
export const DEFAULT_SCRATCH_ARTWORK=SCRATCH_ARTWORKS[0].id;
export const isStudioScratchArtwork=id=>typeof id==='string'&&/^cover-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export const getScratchArtwork=id=>SCRATCH_ARTWORKS.find(a=>a.id===id)||(isStudioScratchArtwork(id)?{id,label:'Saved scratch cover',src:'/api/scratch-artwork/'+id}:null);
