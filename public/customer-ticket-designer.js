import {CUSTOMER_FONTS,FIELD_NAMES,applyCustomerLayout,validateCustomerLayout} from './customer-ticket-layout.js?v=1';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const copy=o=>JSON.parse(JSON.stringify(o));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const labels=['Georgia','Arial','Arial Black','Script','Georgia Serif','Arial Sans','Verdana','Trebuchet','Courier New','Times New Roman','Impact'];
function pos(node,b){for(const [k,v] of Object.entries({left:b.x/9,top:b.y/12,width:b.w/9,height:b.h/12}))node.style[k]=v+'%';}
export function mountCustomerDesigner(card,main,face,edit,getInline,rebuildInline){
 const state=edit.design,layer=el('div','','customer-design-layer'),toolbar=el('section','','customer-design-tools');
 layer.setAttribute('aria-label','Adjust ticket field positions');toolbar.setAttribute('aria-label','Customise selected field');
 const top=el('div','','customer-design-actions'),undo=el('button','Undo'),redo=el('button','Redo'),reset=el('button','Reset design'),done=el('button','Done');
 for(const b of [undo,redo,reset,done])b.type='button';top.append(undo,redo,reset,done);toolbar.append(top);
 const info=el('p','Edit content directly on the ticket. Drag the move or resize handle to adjust the selected field.','customer-design-info');toolbar.append(info);
 const selected=el('p','','customer-field-name');selected.setAttribute('aria-live','polite');toolbar.append(selected);
 const pickerHandles=el('div','','customer-picker-handles');pickerHandles.hidden=true;toolbar.append(pickerHandles);
 const grid=el('div','','customer-design-grid');toolbar.append(grid);
 const fields={};
 function entry(key,label,type,opts){
  const wrap=el('label',label),input=el(type==='select'?'select':'input');
  if(type!=='select')input.type=type; input.setAttribute('aria-label',label);input.dataset.styleControl=key;
  if(type==='select')for(const [value,name] of opts){const o=el('option',name);o.value=value;input.append(o);}
  if(type==='number'){input.min=opts[0];input.max=opts[1];input.step=1;}
  wrap.append(input);grid.append(wrap);fields[key]={wrap,input};return input;
 }
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
 const isPicker=key=>key==='date'||key==='time';
 function syncControls(){
  const list=boxes();if(!list.some(b=>b.key===state.key))state.key=null;
  const z=current();toolbar.hidden=!z;
  pickerHandles.hidden=!z||!isPicker(z.key);
  for(const handle of pickerHandles.children)handle.hidden=handle.dataset.zone!==z?.key;
  if(!z)return;
  selected.textContent=FIELD_NAMES[z.key];grid.hidden=z.key==='image';
  for(const [key,{wrap,input}] of Object.entries(fields)){
   wrap.hidden=z.key==='image';
   if(wrap.hidden)continue;
   if(key==='italic')input.checked=Boolean(z.italic);
   else if(key==='ink')input.value=/^#[0-9a-f]{6}$/i.test(z.ink)?z.ink:/^#[0-9a-f]{3}$/i.test(z.ink)?'#'+z.ink.slice(1).split('').map(c=>c+c).join(''):'#222222';
   else if(key==='weight')input.value=z.weight>=600?'700':'400';
   else input.value=key==='size'?Math.round(z[key]):z[key];
  }
  undo.disabled=!state.undo.length;redo.disabled=!state.redo.length;reset.disabled=!Object.keys(layout()).length;
 }
 function select(key){state.key=key;for(const box of layer.children){box.dataset.selected=String(box.dataset.zone===key);}syncControls();}
 function redraw(){
  const next=edit.read(),result=face.redraw(next.reveal,next.settings);
  rebuildInline(result);
  edit.onOverflow(card.dataset.textOverflow);
  renderBoxes();syncControls();
 }
 function commit(next,history=true){
  try{if(Object.keys(next).length)validateCustomerLayout(face.template,next,settings().imageOrientation);}
  catch(error){report(error.message);renderBoxes();syncControls();return false;}
  if(JSON.stringify(next)===JSON.stringify(layout()))return true;
  if(history){state.undo.push(copy(layout()));if(state.undo.length>50)state.undo.shift();state.redo=[];}
  edit.writeDesign(next);redraw();report(card.dataset.textOverflow?'Text will not fit. Increase the field size or reduce the font size.':'Design updated.');return true;
 }
 function patch(key,values){return commit({...layout(),[key]:{...(layout()[key]||{}),...values}});}
 function renderBoxes(){
  layer.replaceChildren();pickerHandles.replaceChildren();
  for(const zone of boxes()){
   const box=el('div','','customer-zone');box.dataset.zone=zone.key;box.dataset.selected=String(zone.key===state.key);pos(box,zone);
   // The outlines do not intercept taps. Only the two dedicated handles
   // accept pointer input, so text selection and photo upload always work.
   for(const resize of [false,true]){
    // Native date/time controls own their full input area. Keep design handles
    // in the selected field's toolbar instead of overlapping its picker icon.
    const picker=isPicker(zone.key);
    const handle=el('button',picker?(resize?'↘ Resize field':'✥ Move field'):(resize?'↘':'✥'),resize?'customer-resize-handle':'customer-move-handle');
    handle.type='button';handle.dataset.resize=resize?'1':'0';
    handle.setAttribute('aria-label',(resize?'Resize ':'Move ')+FIELD_NAMES[zone.key]);handle.title=handle.getAttribute('aria-label');
    handle.dataset.zone=zone.key;
    if(picker){handle.hidden=zone.key!==state.key;pickerHandles.append(handle);}else box.append(handle);
    let drag=null;
    handle.addEventListener('pointerdown',e=>{
     if(e.button!==0)return;e.preventDefault();e.stopPropagation();select(zone.key);
     const b=card.getBoundingClientRect();if(!b.width||!b.height)return;
     drag={id:e.pointerId,atX:e.clientX,atY:e.clientY,sx:900/b.width,sy:1200/b.height,start:{x:zone.x,y:zone.y,w:zone.w,h:zone.h},next:null};
     handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove',e=>{
     if(!drag||drag.id!==e.pointerId)return;
     const dx=(e.clientX-drag.atX)*drag.sx,dy=(e.clientY-drag.atY)*drag.sy,b=drag.start;
     if(Math.abs(dx)+Math.abs(dy)<2&&!drag.next)return;
     const round=v=>Math.round(v*10)/10;
     drag.next=resize?{...b,w:round(clamp(b.w+dx,12,900-b.x)),h:round(clamp(b.h+dy,12,1200-b.y))}:{...b,x:round(clamp(b.x+dx,0,900-b.w)),y:round(clamp(b.y+dy,0,1200-b.h))};
     pos(box,drag.next);
    });
    handle.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const next=drag.next;drag=null;if(next)patch(zone.key,next);});
    const cancel=()=>{if(drag){drag=null;pos(box,zone);}};
    handle.addEventListener('pointercancel',cancel);handle.addEventListener('lostpointercapture',cancel);
    handle.addEventListener('keydown',e=>{
     const deltas={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!deltas[e.key])return;e.preventDefault();
     const [dx,dy]=deltas[e.key],n=e.shiftKey?10:1;
     patch(zone.key,resize?{w:clamp(zone.w+dx*n,12,900-zone.x),h:clamp(zone.h+dy*n,12,1200-zone.y)}:{x:clamp(zone.x+dx*n,0,900-zone.w),y:clamp(zone.y+dy*n,0,1200-zone.h)});
     const nextHandle=picker?pickerHandles.querySelector('[data-zone="'+zone.key+'"][data-resize="'+(resize?'1':'0')+'"]'):layer.querySelector('[data-selected="true"] [data-resize="'+(resize?'1':'0')+'"]');
     nextHandle?.focus({preventScroll:true});
    });
   }
   layer.append(box);
  }
 }
 for(const [key,{input}] of Object.entries(fields))input.addEventListener('change',()=>{
  const z=current();if(!z)return;
  const value=input.type==='checkbox'?input.checked:input.type==='number'||key==='weight'?Number(input.value):input.value;
  if(input.type==='number'&&!input.value.trim()){syncControls();return;}
  patch(z.key,{[key]:value});
 });
 undo.onclick=()=>{if(!state.undo.length)return;const next=state.undo.pop();state.redo.push(copy(layout()));if(!commit(next,false)){state.undo.push(next);state.redo.pop();syncControls();}};
 redo.onclick=()=>{if(!state.redo.length)return;const next=state.redo.pop();state.undo.push(copy(layout()));if(!commit(next,false)){state.redo.push(next);state.undo.pop();syncControls();}};
 reset.onclick=()=>commit({});
 // Delegate selection to the persistent card, including after a layout
 // redraw replaces inline controls. The native input remains fully editable.
 function selectFromInline(event){
  const zone=event.target.closest?.('[data-inline-zone]');
  if(zone){select(zone.dataset.inlineZone);return;}
  if(event.target.closest?.('.inline-ticket-photo,.inline-photo-remove'))select('image');
 }
 card.addEventListener('focusin',selectFromInline);
 card.addEventListener('click',selectFromInline);
 done.onclick=()=>select(null);
 renderBoxes();syncControls();
}
