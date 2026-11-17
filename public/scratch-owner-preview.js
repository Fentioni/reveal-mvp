/**
 * Private, read-only owner preview. Render the exact recipient face twice,
 * once completely covered and once completely revealed. No public reveal
 * requests, no scratch hooks or audio playback, no unlocking interaction.
 */
import {ScratchCard} from './scratchcard.js?v=concert-professional-7';
import {mountScratchFace,fillScratchFace,setPortraitFaceTheme,setScratchFaceImage} from './scratch-recipient-face.js?v=actual-1';
import {recipientCardModel} from './scratch-recipient-fields.js?v=complete-card-1';
import {getScratchTheme,DEFAULT_SCRATCH_THEME} from './scratch-themes.js?v=themes-13-1';
const stylesheet='/scratch-recipient-face.css?v=actual-1';
function make(tag,text,cls){
 const node=document.createElement(tag);
 if(text)node.textContent=text;
 if(cls)node.className=cls;
 return node;
}
async function stage(host,model,{cover,theme,artwork,eventImage}){
 const root=host.attachShadow({mode:'open'});
 const css=document.createElement('link');css.rel='stylesheet';css.href=stylesheet;
 const ready=new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=()=>reject(new Error('The actual preview styles could not be loaded.'));});
 root.append(css);
 const screen=make('div','','scratch-preview-stage');
 const main=make('main');
 screen.append(main);root.append(screen);
 const eyebrow=make('div',artwork?'A special scratch reveal':theme.icon+' '+theme.label+' reveal','eyebrow');
 const title=make('h1','A surprise for '+model.recipient);
 const intro=make('p','Scratch the surface with your finger or mouse. Every piece of foil stays until you remove it.','intro');
 const card=make('div','','card');
 card.id='card';
 main.append(eyebrow,title,intro,card);
 mountScratchFace(card);
 fillScratchFace(root,model);
 await setScratchFaceImage(root,eventImage);
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
  const canvas=document.createElement('canvas');
  canvas.id='foilCanvas';canvas.setAttribute('aria-hidden','true');
  card.append(canvas);
 }else{
  card.classList.add('foil-ready');
  const link=root.getElementById('bookingUrl');
  link.removeAttribute('href');link.setAttribute('aria-disabled','true');
  if(model.ticketUrl){
   const action=make('span','Open your booking link');
   action.id='bookingAction';action.setAttribute('aria-disabled','true');
   main.append(action);
  }
 }
 await ready;
 return root;
}
export async function renderScratchOwnerPreview(section,{reveal,surface,artwork,eventImage,coverImage,audio}){
 const model=recipientCardModel({...reveal,hasEventImage:reveal.hasImage===true});
 if(model.hasEventImage&&!eventImage)throw new Error('The saved event image could not be loaded. Please retry or amend the reveal.');
 const theme=getScratchTheme(surface.theme||DEFAULT_SCRATCH_THEME);
 const covered=section.querySelector('#scratchActualCovered'),revealed=section.querySelector('#scratchActualRevealed');
 const [coverRoot]=await Promise.all([
  stage(covered,model,{cover:true,theme,artwork,eventImage}),
  stage(revealed,model,{cover:false,theme,artwork,eventImage})
 ]);
 const card=new ScratchCard({
  canvas:coverRoot.getElementById('foilCanvas'),
  foil:surface.foil,theme:theme.id,
  coverStyle:surface.style==='custom'?'classic':surface.style,
  interactive:false
 });
 card.artworkId=artwork?.id||null;
 const image=surface.hasImage?coverImage:artwork?.src;
 if(surface.hasImage&&!image)throw new Error('The saved scratch image could not be loaded.');
 if(image&&!(await card.setCoverImage(image)))throw new Error('The selected scratch artwork could not be opened.');
 section.querySelector('#scratchActualSound').textContent=audio?.enabled!==false
  ? 'Sound: cinematic drum roll begins about 3 seconds after the recipient first scratches.'
  : 'Sound: disabled for the recipient.';
 section.hidden=false;
 return card;
}
