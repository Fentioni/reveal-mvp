import {CUSTOMER_FONTS,FIELD_NAMES,applyCustomerLayout,validateCustomerLayout} from './customer-ticket-layout.js?v=1';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const copy=o=>JSON.parse(JSON.stringify(o));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const labels=['Georgia','Arial','Arial Black','Script','Georgia Serif','Arial Sans','Verdana','Trebuchet','Courier New','Times New Roman','Impact'];
function pos(node,b){for(const [k,v] of Object.entries({left:b.x/9,top:b.y/12,width:b.w/9,height:b.h/12}))node.style[k]=v+'%';}
export function mountCustomerDesigner(card,main,face,edit,getInline,rebuildInline){
 const state=edit.design,layer=el('div','','customer-design-layer'),toolbar=el('section','','customer-design-tools');
 layer.setAttribute('aria-label','Adjust ticket field positions');toolbar.setAttribute('aria-label','Customise selected field');
 const top=el('div','','customer-design-actions'),undo=el('button','Undo'),redo=el('button','Redo'),reset=el('button','Reset design');
 for(const b of [undo,redo,reset])b.type='button';top.append(undo,redo,reset);toolbar.append(top);
 const info=el('p','Select a field, drag it to move, or drag its corner to resize.','customer-design-info');toolbar.append(info);
 const selected=el('select');selected.setAttribute('aria-label','Select field to customise');toolbar.append(selected);
 const grid=el('div','','customer-design-grid');toolbar.append(grid);
 const fields={};
 function entry(key,label,type,opts){
  const wrap=el('label',label),input=el(type==='select'?'select':'input');
  if(type!=='select')input.type=type; input.setAttribute('aria-label',label);input.dataset.styleControl=key;
  if(type==='select')for(const [value,name] of opts){const o=el('option',name);o.value=value;input.append(o);}
  if(type==='number'){input.min=opts[0];input.max=opts[1];input.step=1;}
  wrap.append(input);grid.append(wrap);fields[key]={wrap,input};return input;
 }
 for(const [k,label,max] of [['x','Position X',900],['y','Position Y',1200],['w','Width',900],['h','Height',1200]])entry(k,label,'number',[k==='w'||k==='h'?12:0,max]);
 entry('family','Font','select',CUSTOMER_FONTS.map((f,i)=>[f,labels[i]]));
 entry('size','Font size','number',[12,200]);entry('ink','Text colour','color');
 entry('align','Alignment','select',[['left','Left'],['center','Centre'],['right','Right']]);
 entry('weight','Weight','select',[['400','Regular'],['700','Bold']]);
 entry('italic','Italic','checkbox');
 const status=el('p','','customer-design-status');status.setAttribute('role','status');toolbar.append(status);
 card.append(layer);main.append(toolbar);
 function settings(){return edit.read().settings;}
 function layout(){return settings().layout||{};}
 function effective(){return applyCustomerLayout(face.template,layout(),settings().imageOrientation);}
 function boxes(){const t=effective();return [...t.zones.filter(z=>!z.hidden),...(t.photo&&!t.photo.full?[{...t.photo,key:'image'}]:[])];}
 function current(){return boxes().find(b=>b.key===state.key);}
 function report(text){status.textContent=text;}
 function syncControls(){
  const list=boxes();if(!list.some(b=>b.key===state.key))state.key=list[0]?.key;
  selected.replaceChildren();for(const b of list){const o=el('option',FIELD_NAMES[b.key]);o.value=b.key;selected.append(o);}selected.value=state.key;
  const z=current();if(!z)return;
  for(const [key,{wrap,input}] of Object.entries(fields)){
   wrap.hidden=z.key==='image'&&!['x','y','w','h'].includes(key);
   if(wrap.hidden)continue;
   if(key==='italic')input.checked=Boolean(z.italic);
   else if(key==='ink')input.value=/^#[0-9a-f]{6}$/i.test(z.ink)?z.ink:/^#[0-9a-f]{3}$/i.test(z.ink)?'#'+z.ink.slice(1).split('').map(c=>c+c).join(''):'#222222';
   else if(key==='weight')input.value=z.weight>=600?'700':'400';
   else input.value=['x','y','w','h','size'].includes(key)?Math.round(z[key]):z[key];
  }
  undo.disabled=!state.undo.length;redo.disabled=!state.redo.length;reset.disabled=!Object.keys(layout()).length;
 }
 function select(key){state.key=key;for(const box of layer.children){box.dataset.selected=String(box.dataset.zone===key);box.setAttribute('aria-pressed',String(box.dataset.zone===key));}syncControls();}
 function redraw(){
  const next=edit.read(),result=face.redraw(next.reveal,next.settings);
  const inline=rebuildInline(result);inline.hidden=state.mode;
  edit.onOverflow(card.dataset.textOverflow);
  renderBoxes();syncControls();
 }
 function commit(next,history=true){
  try{validateCustomerLayout(face.template,next,settings().imageOrientation);}
  catch(error){report(error.message);renderBoxes();syncControls();return false;}
  if(JSON.stringify(next)===JSON.stringify(layout()))return true;
  if(history){state.undo.push(copy(layout()));if(state.undo.length>50)state.undo.shift();state.redo=[];}
  edit.writeDesign(next);redraw();report(card.dataset.textOverflow?'Text will not fit. Increase the field size or reduce the font size.':'Design updated.');return true;
 }
 function patch(key,values){return commit({...layout(),[key]:{...(layout()[key]||{}),...values}});}
 function renderBoxes(){
  layer.replaceChildren();
  for(const zone of boxes()){
   const box=el('button','','customer-zone');box.type='button';box.dataset.zone=zone.key;box.dataset.selected=String(zone.key===state.key);box.setAttribute('aria-label','Move or resize '+FIELD_NAMES[zone.key]);box.setAttribute('aria-pressed',String(zone.key===state.key));pos(box,zone);
   const handle=el('span','','customer-resize-handle');handle.dataset.resize='1';handle.setAttribute('aria-hidden','true');box.append(handle);
   let drag=null;
   box.addEventListener('pointerdown',e=>{
    if(!state.mode||e.button!==0)return;e.preventDefault();select(zone.key);
    const b=card.getBoundingClientRect();drag={id:e.pointerId,atX:e.clientX,atY:e.clientY,sx:900/b.width,sy:1200/b.height,resize:e.target===handle,start:{x:zone.x,y:zone.y,w:zone.w,h:zone.h},next:null};box.setPointerCapture(e.pointerId);
   });
   box.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const dx=(e.clientX-drag.atX)*drag.sx,dy=(e.clientY-drag.atY)*drag.sy,b=drag.start;
    if(Math.abs(dx)+Math.abs(dy)<2&&!drag.next)return;
    const round=v=>Math.round(v*10)/10;
    drag.next=drag.resize?{...b,w:round(clamp(b.w+dx,12,900-b.x)),h:round(clamp(b.h+dy,12,1200-b.y))}:{...b,x:round(clamp(b.x+dx,0,900-b.w)),y:round(clamp(b.y+dy,0,1200-b.h))};
    pos(box,drag.next);
   });
   box.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const next=drag.next;drag=null;if(next)patch(zone.key,next);});
   box.addEventListener('pointercancel',()=>{drag=null;pos(box,zone);});
   box.addEventListener('click',()=>select(zone.key));
   box.addEventListener('keydown',e=>{
    const deltas={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!deltas[e.key])return;e.preventDefault();
    const [dx,dy]=deltas[e.key],n=e.shiftKey?10:1;patch(zone.key,{x:clamp(zone.x+dx*n,0,900-zone.w),y:clamp(zone.y+dy*n,0,1200-zone.h)});
   });
   layer.append(box);
  }
 }
 selected.addEventListener('change',()=>select(selected.value));
 for(const [key,{input}] of Object.entries(fields))input.addEventListener('change',()=>{
  const z=current();if(!z)return;
  const value=input.type==='checkbox'?input.checked:input.type==='number'||key==='weight'?Number(input.value):input.value;
  if(input.type==='number'&&!input.value.trim()){syncControls();return;}
  patch(z.key,{[key]:value});
 });
 undo.onclick=()=>{if(!state.undo.length)return;const next=state.undo.pop();state.redo.push(copy(layout()));if(!commit(next,false)){state.undo.push(next);state.redo.pop();syncControls();}};
 redo.onclick=()=>{if(!state.redo.length)return;const next=state.redo.pop();state.undo.push(copy(layout()));if(!commit(next,false)){state.redo.push(next);state.undo.pop();syncControls();}};
 reset.onclick=()=>commit({});
 function syncMode(){
  const inline=getInline();inline.hidden=state.mode;layer.hidden=!state.mode;toolbar.hidden=!state.mode;
  if(state.mode){renderBoxes();syncControls();}
 }
 card.addEventListener('customer-mode',syncMode);
 syncMode();
}
