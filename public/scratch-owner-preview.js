import {normalizeBookingLink} from './booking-link.js?v=1';
import {renderPostScratchFace} from './post-scratch-face.js?v=clean-template-text-1';
/**
 * Private owner preview; optional creator-only inline controls. Render the exact recipient face twice,
 * once completely covered and once completely revealed. No public reveal
 * requests, no scratch hooks or audio playback, no unlocking interaction.
 */
import {ScratchCard} from './scratchcard.js?v=concert-professional-8';
import {setPortraitFaceTheme} from './scratch-recipient-face.js?v=post-templates-1';
import {recipientCardModel} from './scratch-recipient-fields.js?v=complete-card-1';
import {getScratchTheme,DEFAULT_SCRATCH_THEME} from './scratch-themes.js?v=themes-13-1';
const stylesheet='/scratch-recipient-face.css?v=inline-photo-1';
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
// SVG text is the actual final artwork. The creator-only native controls
// sit at its exact zone coordinates and stay mounted while that SVG redraws.
const inlineFields={
 eventName:['eventName','Surprise title','textarea',160,true],
 subtitle:['postSubtitle','Subtitle','text',100,false],
 recipient:['recipient','For You','text',80,true],
 sender:['sender','From Me','text',80,true],
 senderLine:['sender','From Me','text',80,true],
 date:['eventDate','Date','date',0,false],
 time:['eventTime','Time','time',0,false],
 venue:['venue','Venue / destination','text',200,false],
 venueAddress:['postVenueAddress','Address / location','text',140,false],
 message:['personalMessage','Personal message','textarea',1200,false],
 link:['ticketUrl','Event link','url',2048,false]
};
function positionInline(node,box){
 for(const [key,attr,dimension] of [['left','x',900],['top','y',1200],['width','width',900],['height','height',1200]])
  node.style[key]=Number(box.getAttribute(attr))/dimension*100+'%';
}
function mountInlineEditor(card,face,edit){
 const overlay=make('div','','inline-ticket-editor');overlay.setAttribute('role','group');overlay.setAttribute('aria-label','Edit your revealed ticket');
 const update=(id,value)=>{
  edit.write(id,value);
  const next=edit.read();face.redraw(next.reveal,next.settings);edit.onOverflow(card.dataset.textOverflow);
 };
 for(const slot of face.svg.querySelectorAll('[data-slot]')){
  const meta=inlineFields[slot.dataset.slot],box=slot.querySelector(':scope > rect');
  if(!meta||!box)continue;
  const [id,label,type,max,required]=meta,wrap=make('div','','inline-ticket-field'),control=make(type==='textarea'?'textarea':'input');
  positionInline(wrap,box);
  wrap.dataset.inlineZone=slot.dataset.slot;control.dataset.editField=id;
  if(type!=='textarea')control.type=type;else control.rows=2;
  control.setAttribute('aria-label',label+(required?' (required)':' (optional)'));
  if(id==='ticketUrl')control.inputMode='url';
  control.title=slot.dataset.fixedText==='true'?'Template wording is fixed; enter customer details separately.':'Edit '+label;control.value=edit.value(id);control.placeholder=label;
  if(max)control.maxLength=max;if(required)control.required=true;
  control.autocomplete='off';
  if(!['date','time'].includes(type)){control.enterKeyHint=id==='personalMessage'?'enter':'done';}
  const text=slot.querySelector('[data-field]');const align=text?.getAttribute('text-anchor');
  control.style.textAlign=align==='start'?'left':align==='end'?'right':'center';
  control.addEventListener('input',()=>update(id,control.value));
  const commit=()=>{if(id==='ticketUrl'){const normalized=normalizeBookingLink(control.value);if(normalized!==null)control.value=normalized;}if(edit.value(id)!==control.value)update(id,control.value);};
  control.addEventListener('change',commit);
  if(id==='ticketUrl')control.addEventListener('blur',commit);
  control.addEventListener('keydown',e=>{if(e.key==='Enter'&&id!=='personalMessage'&&!e.isComposing){e.preventDefault();control.blur();}if(e.key==='Escape'){e.preventDefault();control.blur();}});
  wrap.append(control);overlay.append(wrap);
 }
 // The image frame itself can also open the existing file picker. Full-card
 // image templates retain the separate upload control to avoid masking text.
 if(card.dataset.postTemplate!=='custom-image'&&edit.chooseImage){
  const box=face.svg.querySelector('[data-photo-slot] > rect');
  if(box){
   const hasImage=edit.hasImage?.()??Boolean(face.svg.querySelector('[data-photo-slot] image'));
   const upload=make('button','','inline-ticket-photo');upload.type='button';positionInline(upload,box);
   upload.setAttribute('aria-label','Upload or replace image');upload.title=edit.imageHelp?.()||'Upload or replace image';
   if(!hasImage){const prompt=make('span','Tap to add image','inline-photo-prompt');upload.append(prompt);}
   upload.addEventListener('click',edit.chooseImage);overlay.prepend(upload);
   if(hasImage&&edit.removeImage){
    const remove=make('button','×','inline-photo-remove');remove.type='button';remove.setAttribute('aria-label','Remove image');remove.title='Remove image';
    remove.style.left=(Number(box.getAttribute('x'))+Number(box.getAttribute('width')))/9+'%';
    remove.style.top=Number(box.getAttribute('y'))/12+'%';
    remove.addEventListener('click',edit.removeImage);overlay.append(remove);
   }
  }
 }
 card.append(overlay);
}
async function stage(host,model,{cover,theme,artwork,eventImage,reveal,surface,guides=false,edit=null,creator=false}){
 const root=host.shadowRoot||host.attachShadow({mode:'open'});
 root.replaceChildren();
 const css=document.createElement('link');css.rel='stylesheet';css.href=stylesheet;
 const ready=new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=()=>reject(new Error('The actual preview styles could not be loaded.'));});
 root.append(css);
 const screen=make('div','','scratch-preview-stage');
 if(creator)screen.classList.add('scratch-inline-creator');
 const main=make('main');
 screen.append(main);root.append(screen);
 const card=make('div','','card');
 card.id='card';
 main.append(card);
 const face=await renderPostScratchFace(card,reveal,surface.postScratch,eventImage,{guides:!cover&&guides});
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

  if(edit)mountInlineEditor(card,face,edit);
  if(model.ticketUrl&&!edit){
   const action=make('span','Open your booking link');
   action.id='bookingAction';action.setAttribute('aria-disabled','true');
   main.append(action);
  }
 }
 await ready;
 return root;
}
export async function renderScratchOwnerPreview(section,{reveal,surface,artwork,eventImage,coverImage,audio,hosts,guides=false,edit=null}){
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
  stage(covered,model,{cover:true,theme,artwork,eventImage,reveal,surface,creator:!!edit}),
  stage(revealed,model,{cover:false,theme,artwork,eventImage,reveal,surface,guides,edit,creator:!!edit})
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
