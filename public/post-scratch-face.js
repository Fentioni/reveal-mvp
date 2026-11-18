import {loadPublishedDesign} from './published-template-designs.js?v=template-management-1';
import {cleanPostSettings} from './post-scratch-settings.js?v=customer-design-1';
import {renderPostScratchTemplate,templateArtworkSource} from './post-scratch-renderer.js?v=customer-design-1';
export async function renderPostScratchFace(card,reveal,settings,imageSrc='',{guides=false}={}){
 const s=cleanPostSettings(settings),{template}=await loadPublishedDesign(s.templateId);
 // Load before showing the underlay, including authenticated blob images.
 await Promise.all([templateArtworkSource(template),imageSrc].filter(Boolean).map(src=>new Promise((resolve,reject)=>{
  const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error('The revealed design image could not be loaded.'));image.src=src;
 })));
 let face=card.querySelector('#underlay');
 if(!face){face=document.createElement('div');face.id='underlay';card.prepend(face);}
 face.className='ticket-underlay post-scratch-underlay';
 card.classList.add('post-scratch-card');
 // Redraw the vector face without rebuilding the stable creator input layer.
 const redraw=(nextReveal,nextSettings=s)=>{
  const result=renderPostScratchTemplate(face,template,{...nextReveal,subtitle:nextSettings.subtitle,venueAddress:nextSettings.venueAddress},{...nextSettings,imageSrc,guides,preview:guides});
  card.dataset.postTemplate=s.templateId;
  card.dataset.textOverflow=result.errors.join(',');
  return result;
 };
 return {...redraw(reveal),redraw,template};
}
