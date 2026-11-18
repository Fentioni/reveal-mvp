import {getPostTemplate} from './post-scratch-catalogue.js';
import {isStudioTemplateId} from './template-design-schema.js';
export const DEFAULT_POST_SETTINGS=Object.freeze({templateId:'candlelight',subtitle:'',venueAddress:'',imagePosition:'xMidYMid',imageFit:'auto',imageOrientation:'auto',imageZoom:100,imagePanX:0,imagePanY:0,textContrast:'light',shade:70});
const validRange=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function checkPostSettings(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const s={...DEFAULT_POST_SETTINGS,...input};
 if((!getPostTemplate(s.templateId)&&!isStudioTemplateId(s.templateId))||typeof s.subtitle!=='string'||s.subtitle.length>100||typeof s.venueAddress!=='string'||s.venueAddress.length>140||!/^x(?:Min|Mid|Max)Y(?:Min|Mid|Max)$/.test(s.imagePosition)||!['auto','contain','cover'].includes(s.imageFit)||!['auto','portrait','landscape'].includes(s.imageOrientation)||!validRange(s.imageZoom,50,300)||!validRange(s.imagePanX,-100,100)||!validRange(s.imagePanY,-100,100)||!['light','dark'].includes(s.textContrast)||typeof s.shade!=='number'||!Number.isFinite(s.shade)||s.shade<0||s.shade>90)return null;
 return Object.fromEntries(Object.keys(DEFAULT_POST_SETTINGS).map(k=>[k,s[k]]));
}
export const cleanPostSettings=input=>checkPostSettings(input)||{...DEFAULT_POST_SETTINGS};
