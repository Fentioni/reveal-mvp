import {FONTS} from './template-design-schema.js';
export const CUSTOMER_FONTS=FONTS;
export const FIELD_NAMES={eventName:'Surprise title',subtitle:'Subtitle',recipient:'For You',sender:'From Me',senderLine:'From Me',date:'Date',time:'Time',venue:'Venue',venueAddress:'Address',message:'Personal message',link:'Event link',image:'Image frame'};
const geom=['x','y','w','h'],styles=['size','family','ink','weight','italic','align'];
const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function checkCustomerLayout(input){
 if(!object(input)||Object.keys(input).length>11)return null;
 const out={};
 for(const [key,patch] of Object.entries(input)){
  if(!Object.hasOwn(FIELD_NAMES,key)||!object(patch))return null;
  const next={};
  for(const [k,v] of Object.entries(patch)){
   if(![...geom,...(key==='image'?[]:styles)].includes(k))return null;
   if(geom.includes(k)){if(!num(v,['w','h'].includes(k)?12:0,['x','w'].includes(k)?900:1200))return null;}
   else if(k==='size'&&!num(v,12,200)||k==='family'&&!FONTS.includes(v)||k==='ink'&&(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))||k==='weight'&&![400,700].includes(v)||k==='italic'&&typeof v!=='boolean'||k==='align'&&!['left','center','right'].includes(v))return null;
   next[k]=v;
  }
  if(Object.keys(next).length)out[key]=next;
 }
 return out;
}
export function photoFrame(p,orientation='auto'){
 if(!['portrait','landscape'].includes(orientation))return {...p};
 const ratio=orientation==='portrait'?3/4:4/3;
 const w=Math.min(p.w,p.h*ratio),h=w/ratio;
 return {...p,x:p.x+(p.w-w)/2,y:p.y+(p.h-h)/2,w,h};
}
export function orientTemplate(template,orientation){
 if(!template.photo||!['portrait','landscape'].includes(orientation))return template;
 const old=template.photo,photo=photoFrame(old,orientation);
 const panels=(template.panels||[]).map(p=>p.key!=='image'?p:{...p,x:photo.x-(old.x-p.x),y:photo.y-(old.y-p.y),w:photo.w+(p.w-old.w),h:photo.h+(p.h-old.h)});
 return {...template,photo,panels};
}
function movePanel(panel,old,next){
 if(!old||!next)return panel;
 if(geom.every(k=>old[k]===next[k]))return panel;
 const sx=next.w/old.w,sy=next.h/old.h;
 const reposition=b=>{
  const w=Math.min(900,b.w*sx),h=Math.min(1200,b.h*sy);
  return {x:Math.max(0,Math.min(900-w,next.x+(b.x-old.x)*sx)),y:Math.max(0,Math.min(1200-h,next.y+(b.y-old.y)*sy)),w,h};
 };
 const b=reposition(panel),out={...panel,...b,rx:Math.min(panel.rx||0,b.w/2,b.h/2)};
 if(panel.key!=='image'){
  out.gutter=Math.min(b.w-1,(panel.gutter||0)*sx);
  out.labelH=Math.min(b.h-1,(panel.labelH||0)*sy);
  if(panel.valueBox)out.valueBox=reposition(panel.valueBox);
 }
 return out;
}
// Only copy allowed customer overrides; no changes to shared master artwork.
export function applyCustomerLayout(template,layout={},orientation='auto'){
 const base=orientTemplate(template,orientation);
 const patches=checkCustomerLayout(layout);if(!patches)throw Error('Invalid design changes.');
 const old=new Map(base.zones.map(z=>[z.key,z]));
 const zones=base.zones.map(z=>({...z,...patches[z.key],...(patches[z.key]?.ink?{useTemplateInk:true}:{})}));
 const photo=base.photo&&!base.photo.full?{...base.photo,...patches.image}:base.photo;
 const byKey=new Map(zones.map(z=>[z.key,z]));
 const panels=(base.panels||[]).map(p=>movePanel(p,p.key==='image'?base.photo:old.get(p.key),p.key==='image'?photo:byKey.get(p.key)));
 return {...base,zones,photo,panels};
}
export function validateCustomerLayout(template,layout={},orientation='auto'){
 const patches=checkCustomerLayout(layout);if(!patches)throw Error('Invalid design changes.');
 const allowed=new Set(template.zones.filter(z=>!z.hidden).map(z=>z.key));
 if(template.photo&&!template.photo.full)allowed.add('image');
 if(Object.keys(patches).some(k=>!allowed.has(k)))throw Error('This field cannot be changed.');
 const t=applyCustomerLayout(template,patches,orientation);
 const boxes=[...t.zones.filter(z=>!z.hidden),...(t.photo&&!t.photo.full?[{...t.photo,key:'image'}]:[])];
 for(const [i,a] of boxes.entries()){
  if(a.x<0||a.y<0||a.w<12||a.h<12||a.x+a.w>900.01||a.y+a.h>1200.01)throw Error('Keep '+FIELD_NAMES[a.key]+' inside the ticket.');
  for(const b of boxes.slice(i+1))if(a.x<b.x+b.w-.01&&a.x+a.w>b.x+.01&&a.y<b.y+b.h-.01&&a.y+a.h>b.y+.01)throw Error(FIELD_NAMES[a.key]+' overlaps '+FIELD_NAMES[b.key]+'. Choose a different position or size.');
 }
 return t;
}
