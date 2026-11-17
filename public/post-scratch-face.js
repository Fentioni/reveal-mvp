import {getPostTemplate} from './post-scratch-catalogue.js?v=reference-panels-1';
import {cleanPostSettings} from './post-scratch-settings.js';
import {renderPostScratchTemplate} from './post-scratch-renderer.js?v=reference-panels-1';
export async function renderPostScratchFace(card,reveal,settings,imageSrc=''){
 const s=cleanPostSettings(settings),template=getPostTemplate(s.templateId);
 // Load before showing the underlay, including authenticated blob images.
 await Promise.all([template.id==='custom-image'?'':template.image,imageSrc].filter(Boolean).map(src=>new Promise((resolve,reject)=>{
  const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error('The revealed design image could not be loaded.'));image.src=src;
 })));
 let face=card.querySelector('#underlay');
 if(!face){face=document.createElement('div');face.id='underlay';card.prepend(face);}
 face.className='ticket-underlay post-scratch-underlay';
 card.classList.add('post-scratch-card');
 const result=renderPostScratchTemplate(face,template,{...reveal,subtitle:s.subtitle,venueAddress:s.venueAddress},{...s,imageSrc});
 card.dataset.postTemplate=s.templateId;
 card.dataset.textOverflow=result.errors.join(',');
 return result;
}
