export {PAIRED_TEMPLATES as POST_TEMPLATES} from './paired-products.js';
import {PAIRED_TEMPLATES} from './paired-products.js';
export const getPostTemplate=id=>PAIRED_TEMPLATES.find(t=>t.id===id);
