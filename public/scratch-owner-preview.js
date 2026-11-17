import {renderPostScratchFace} from './post-scratch-face.js?v=designer-1';
/**
 * Private, read-only owner preview. Render the exact recipient face twice,
 * once completely covered and once completely revealed. No public reveal
 * requests, no scratch hooks or audio playback, no unlocking interaction.
 */
import {ScratchCard} from './scratchcard.js?v=concert-professional-8';
import {setPortraitFaceTheme} from './scratch-recipient-face.js?v=post-templates-1';
import {recipientCardModel} from './scratch-recipient-fields.js?v=complete-card-1';
import {getScratchTheme,DEFAULT_SCRATCH_THEME} from './scratch-themes.js?v=themes-13-1';
const stylesheet='/scratch-recipient-face.css?v=post-preview-compact-2';
const active=new WeakMap();
const boundSwitches=new WeakSet();
function setupPreviewSwitch(section,covered,revealed){
 const controls=[...section.querySelectorAll('[data-scratch-preview-mode]')];
 if(!controls.length)return;
 function select(mode){
  mode=mode==='revealed'?'revealed':'covered';
  section.dataset.previewMode=mode;
  for(const button of controls)button.setAttribute('aria-pressed',String(button.dataset.scratchPreviewMode===mode));
  for(const [name,panel] of [['covered',covered],['revealed',revealed]]){
   const inactive=name!==mode;
   panel.inert=inactive;
   if(inactive)panel.setAttribute('aria-hidden','true');
   else panel.removeAttribute('aria-hidden');
  }
 }
 if(!boundSwitches.has(section)){
  for(const button of controls)button.addEventListener('click',()=>select(button.dataset.scratchPreviewMode));
  boundSwitches.add(section);
 }
 select(section.dataset.previewMode);
}
export function disposeScratchOwnerPreview(section){
 active.get(section)?.destroy();
 active.delete(section);
}
function make(tag,text,cls){
 const node=document.createElement(tag);
 if(text)node.textContent=text;
 if(cls)node.className=cls;
 return node;
}
async function stage(host,model,{cover,theme,artwork,eventImage,reveal,surface}){
 const root=host.shadowRoot||host.attachShadow({mode:'open'});
 root.replaceChildren();
 const css=document.createElement('link');css.rel='stylesheet';css.href=stylesheet;
 const ready=new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=()=>reject(new Error('The actual preview styles could not be loaded.'));});
 root.append(css);
 const screen=make('div','','scratch-preview-stage');
 const main=make('main');
 screen.append(main);root.append(screen);
 const card=make('div','','card');
 card.id='card';
 main.append(card);
 await renderPostScratchFace(card,reveal,surface.postScratch,eventImage);
 if(!artwork){
  setPortraitFaceTheme(card,theme.id);
  screen.classList.add('scratch-preview-themed');
  for(const [key,value] of Object.entries({
   '--scratch-bg':theme.bg,'--scratch-bg2':theme.bg2,'--scratch-accent':theme.accent,'--scratch-highlight':theme.highlight
  }))screen.style.setProperty(key,value);
 }
 // Keep the same geometry as the paid card; visibility:hidden preserves
 // the underlay's size without showing any details through the surface.
 if(cover){
  root.getElementById('underlay').inert=true;
  root.getElementById('underlay').setAttribute('aria-hidden','true');
  card.dataset.previewState='covered';
  const canvas=document.createElement('canvas');
  canvas.id='foilCanvas';canvas.setAttribute('aria-hidden','true');
  card.append(canvas);
 }else{
  card.classList.add('foil-ready');
  card.dataset.previewState='revealed';

  if(model.ticketUrl){
   const action=make('span','Open your booking link');
   action.id='bookingAction';action.setAttribute('aria-disabled','true');
   main.append(action);
  }
 }
 await ready;
 return root;
}
export async function renderScratchOwnerPreview(section,{reveal,surface,artwork,eventImage,coverImage,audio,hosts}){
 const model=recipientCardModel({...reveal,hasEventImage:reveal.hasImage===true});
 if(model.hasEventImage&&!eventImage)throw new Error('The saved event image could not be loaded. Please retry or amend the reveal.');
 const theme=getScratchTheme(surface.theme||DEFAULT_SCRATCH_THEME);
 const covered=hosts?.covered||section.querySelector('#scratchActualCovered');
 const revealed=hosts?.revealed||section.querySelector('#scratchActualRevealed');
 const sound=hosts?.sound||section.querySelector('#scratchActualSound');
 disposeScratchOwnerPreview(section);
 setupPreviewSwitch(section,covered,revealed);
 section.hidden=false;
 const [coverRoot]=await Promise.all([
  stage(covered,model,{cover:true,theme,artwork,eventImage,reveal,surface}),
  stage(revealed,model,{cover:false,theme,artwork,eventImage,reveal,surface})
 ]);
 const card=new ScratchCard({
  canvas:coverRoot.getElementById('foilCanvas'),
  foil:surface.foil,theme:theme.id,
  coverStyle:surface.style==='custom'?'classic':surface.style,
  interactive:false
 });
 card.artworkId=artwork?.id||null;
 const image=surface.hasImage?coverImage:artwork?.src;
 if(!surface.hasImage&&!artwork&&surface.artworkId)throw new Error('Your selected scratch artwork is not available.');
 if(surface.hasImage&&!image)throw new Error('The saved scratch image could not be loaded.');
 if(image&&!(await card.setCoverImage(image)))throw new Error('The selected scratch artwork could not be opened.');
 active.set(section,card);
 covered.dataset.renderedArtwork=artwork?.id||'';
 revealed.dataset.renderedImage=eventImage||'';
 sound.textContent=audio?.enabled!==false
  ? 'Sound: cinematic drum roll begins about 3 seconds after the recipient first scratches.'
  : 'Sound: disabled for the recipient.';
 section.hidden=false;
 return card;
}
