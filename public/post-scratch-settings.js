import {getPostTemplate} from './post-scratch-catalogue.js';
export const DEFAULT_POST_SETTINGS=Object.freeze({templateId:'candlelight',subtitle:'',venueAddress:'',imagePosition:'xMidYMid',textContrast:'light',shade:70});
export function checkPostSettings(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const s={...DEFAULT_POST_SETTINGS,...input};
 if(!getPostTemplate(s.templateId)||typeof s.subtitle!=='string'||s.subtitle.length>100||typeof s.venueAddress!=='string'||s.venueAddress.length>140||!/^x(?:Min|Mid|Max)Y(?:Min|Mid|Max)$/.test(s.imagePosition)||!['light','dark'].includes(s.textContrast)||typeof s.shade!=='number'||!Number.isFinite(s.shade)||s.shade<0||s.shade>90)return null;
 return Object.fromEntries(Object.keys(DEFAULT_POST_SETTINGS).map(k=>[k,s[k]]));
}
export const cleanPostSettings=input=>checkPostSettings(input)||{...DEFAULT_POST_SETTINGS};
