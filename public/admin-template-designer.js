import {POST_TEMPLATES} from './post-scratch-catalogue.js';
import {defaultDesign,validateDesign,clone,FONTS} from './template-design-schema.js?v=1';
import {renderPostScratchTemplate} from './post-scratch-renderer.js?v=designer-1';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const names={eventName:'Surprise title',subtitle:'Subtitle',recipient:'Recipient',sender:'From / host',senderLine:'From / host',date:'Date',time:'Time',venue:'Venue',venueAddress:'Address',message:'Personal message',link:'Event link'};
const typical={eventName:'A night to remember',subtitle:'A special surprise',recipient:'Chloe',sender:'Michael',eventDate:'2027-03-20',eventTime:'19:30',venue:'Theatre Royal',venueAddress:'Drury Lane, London',personalMessage:'A wonderful evening, just for you.',ticketUrl:'https://example.org'};
const longer={...typical,eventName:'Jesus Christ Superstar — a very special evening',subtitle:'An unforgettable experience for a wonderful birthday',venue:'Theatre Royal, Drury Lane',venueAddress:'Catherine Street, Covent Garden, London',personalMessage:'Happy birthday! I hope you have a wonderful time. We are going to enjoy a special evening together.'};
const fontLabels=['Georgia / serif','Arial / sans serif','Arial Black','Script','Georgia','Arial','Verdana','Trebuchet','Courier New','Times New Roman','Impact'];
const min=(v,a,b)=>Math.max(a,Math.min(b,v)),round=v=>Math.round(v*10)/10;
let model,revision='base',saved='',selected='zone:eventName',undo=[],redo=[],token='',busy=false,requestId=0,drag=null,imageUrl='',frame=0,lastResult;
const sampleCanvas=document.createElement('canvas');sampleCanvas.width=900;sampleCanvas.height=1200;
const ctx=sampleCanvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,900,1200);gradient.addColorStop(0,'#152747');gradient.addColorStop(1,'#954766');ctx.fillStyle=gradient;ctx.fillRect(0,0,900,1200);ctx.strokeStyle='#f8d285';ctx.lineWidth=8;ctx.strokeRect(40,40,820,1120);ctx.fillStyle='#f6d08d';ctx.textAlign='center';ctx.font='bold 75px Georgia';ctx.fillText('THEATRE',450,360);ctx.fillText('NIGHT',450,445);ctx.font='37px Arial';ctx.fillText('20 MARCH 2027',450,875);
const sampleImage=sampleCanvas.toDataURL('image/png');
function status(s,error=false){$('status').textContent=s;$('status').style.color=error?'#ffb3b3':'';}
function clean(){return JSON.stringify(model)===saved;}
function mark(){if(!model)return;$('revision').textContent=(revision==='base'?'Original template':'Saved version '+revision.slice(0,8))+(clean()?' · No unsaved changes':' · Unsaved changes');$('undo').disabled=!undo.length||busy;$('redo').disabled=!redo.length||busy;$('save').disabled=busy||clean();$('template').disabled=busy;}
function remember(){undo.push(clone(model));if(undo.length>75)undo.shift();redo=[];}
function changed(full=true){mark();paint();if(full){layers();inspector();}}
function apiHeaders(){return {'Authorization':'Bearer '+token,'Content-Type':'application/json'};}
async function response(r){const body=await r.json().catch(()=>({}));if(!r.ok)throw Error(body.error||'Request failed ('+r.status+')');return body;}
async function load(id,force=false){
 if(model&&!clean()&&!force&&!confirm('Discard your unsaved changes?')){$('template').value=model.id;return;}
 const run=++requestId;busy=true;mark();status('Loading '+POST_TEMPLATES.find(t=>t.id===id)?.name+'…');
 try{const d=await response(await fetch('/api/template-designs/'+id,{cache:'no-store'}));if(run!==requestId)return;model=d.template||defaultDesign(id);revision=d.revision||'base';status('Template loaded.');}
 catch(e){if(run!==requestId)return;model=defaultDesign(id);revision='base';status('Using original template: '+e.message,true);}
 if(run!==requestId)return;undo=[];redo=[];saved=JSON.stringify(model);selected='zone:eventName';busy=false;$('template').value=id;changed();
}
function allLayers(){
 const a=[...model.zones.map(z=>({key:'zone:'+z.key,title:names[z.key]||z.key,type:'Text',off:z.hidden})),{key:'photo',title:'Image area',type:'Image'}];
 a.push(...model.panels.map(p=>({key:'panel:'+p.key,title:(names[p.key]||'Image')+' panel',type:'Panel'})));
 if(model.illustration)a.push({key:'illustration',title:'DJ illustration',type:'Artwork'});
 a.push(...model.decor.map((d,i)=>({key:'decor:'+i,title:d.kind==='text'?d.text.slice(0,28):d.kind[0].toUpperCase()+d.kind.slice(1)+' '+(i+1),type:'Shape'})));
 a.push({key:'background',title:'Background artwork',type:'Base',off:!model.showBackground});return a;
}
function element(key=selected){
 const [k,id]=key.split(':');
 return k==='zone'?model.zones.find(x=>x.key===id):k==='panel'?model.panels.find(x=>x.key===id):k==='decor'?model.decor[Number(id)]:k==='photo'?model.photo:k==='illustration'?model.illustration:k==='background'?model:null;
}
function bounds(key=selected,obj=element(key)){
 if(!obj||key==='background')return null;
 if(obj.kind==='line')return {x:Math.min(obj.x1,obj.x2),y:Math.min(obj.y1,obj.y2),w:Math.max(12,Math.abs(obj.x2-obj.x1)),h:Math.max(12,Math.abs(obj.y2-obj.y1))};
 if(obj.kind==='path'){const n=$('render').querySelector('[data-decor-index="'+key.split(':')[1]+'"]');if(!n)return null;const b=n.getBBox();return {x:b.x,y:b.y,w:Math.max(12,b.width),h:Math.max(12,b.height)};}
 return {x:obj.x,y:obj.y,w:obj.w,h:obj.h};
}
function box(o,b){Object.assign(o,{x:round(b.x),y:round(b.y),w:round(b.w),h:round(b.h)});}
function fitBox(b){const w=min(b.w,12,900),h=min(b.h,12,1200);return {x:min(b.x,0,900-w),y:min(b.y,0,1200-h),w,h};}
function transformBox(o,old,next){box(o,fitBox({x:next.x+(o.x-old.x)*next.w/old.w,y:next.y+(o.y-old.y)*next.h/old.h,w:o.w*next.w/old.w,h:o.h*next.h/old.h}));}
function moveBox(key,next,previous){
 const o=element(key);if(!o)return;const old=previous||bounds(key);next=fitBox(next);
 if(o.kind==='path'){o.tx=round((o.tx||0)+next.x-old.x);o.ty=round((o.ty||0)+next.y-old.y);return;}
 if(o.kind==='line'){const x=v=>round(min(next.x+(v-old.x)*next.w/old.w,0,900)),y=v=>round(min(next.y+(v-old.y)*next.h/old.h,0,1200));Object.assign(o,{x1:x(o.x1),x2:x(o.x2),y1:y(o.y1),y2:y(o.y2)});return;}
 if(key.startsWith('panel:')){
  const z=model.zones.find(z=>z.key===o.key);
  if(z)transformBox(z,old,next);
  if(o.key==='image')transformBox(model.photo,old,next);
  if(o.valueBox)transformBox(o.valueBox,old,next);
  if(o.gutter!==undefined)o.gutter=min(round(o.gutter*next.w/old.w),0,next.w-1);
  if(o.labelH!==undefined)o.labelH=min(round(o.labelH*next.h/old.h),0,next.h-1);
 }else if(key==='photo'){
  const p=model.panels.find(p=>p.key==='image');
  if(p)transformBox(p,old,next);
 }
 box(o,next);
}
function layers(){
 $('layers').replaceChildren();
 for(const l of allLayers()){
  const b=document.createElement('button');b.type='button';b.className='layer'+(l.key===selected?' selected':'')+(l.off?' off':'');b.dataset.layer=l.key;b.setAttribute('aria-pressed',String(l.key===selected));
  const text=document.createElement('span');text.textContent=l.title;const type=document.createElement('span');type.className='type';type.textContent=l.type;b.append(text,type);$('layers').append(b);
 }
 const o=element();$('remove').disabled=!o||selected==='background';$('remove').textContent=o?.hidden?'Show field':'Remove / hide';
 const index=selected.startsWith('decor:')?Number(selected.split(':')[1]):-1;
 $('layerUp').disabled=index<0||index===model.decor.length-1;$('layerDown').disabled=index<=0;
 $('restoreArt').hidden=!!model.illustration||!defaultDesign(model.id).illustration;
}
function select(key){if(!element(key))return;selected=key;layers();inspector();selection();}
function group(label){const e=document.createElement('div');e.className='group-title';e.textContent=label;$('properties').append(e);}
function control(label,key,type,value,options={}){
 const parent=options.parent||$('properties'),wrap=document.createElement('div');wrap.className='prop'+(type==='checkbox'?' checkbox':'');
 const id='prop-'+key,l=document.createElement('label');l.htmlFor=id;l.textContent=label;
 const input=document.createElement(type==='select'?'select':type==='textarea'?'textarea':'input');input.id=id;
 if(!['select','textarea'].includes(type))input.type=type;
 if(type==='select')for(const [v,t] of options.choices){const o=document.createElement('option');o.value=v;o.textContent=t;input.append(o);}
 if(type==='checkbox')input.checked=!!value;else input.value=value??'';
 if(type==='number'){input.min=options.min??0;input.max=options.max??1200;input.step=options.step??1;}
 if(type==='color')input.value=/^#[0-9a-f]{6}$/i.test(value)?value:/^#[0-9a-f]{3}$/i.test(value)?'#'+[...value.slice(1)].map(x=>x+x).join(''):'#000000';
 input.addEventListener('change',()=>{const v=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;if(type==='number'&&!Number.isFinite(v))return;remember();options.apply?options.apply(v):element()[key]=v;changed();});
 if(type==='checkbox')wrap.append(input,l);else wrap.append(l,input);parent.append(wrap);return input;
}
function paintColor(label,key,o){
 const value=o[key]||'none';control(label,key,'color',value,{apply:v=>{element()[key]=v;if(model.id==='custom-image'&&selected.startsWith('zone:')&&key==='ink')element().useTemplateInk=true;}});
 if(['fill','stroke','iconBg'].includes(key))control('Transparent '+label,key+'-clear','checkbox',value==='none'||value==='',{apply:v=>element()[key]=v?'none':'#ffffff'});
}
function number(label,key,o,lo,hi,step=1){control(label,key,'number',o[key],{min:lo,max:hi,step,apply:v=>element()[key]=min(v,lo,hi)});}
function inspector(){
 const p=$('properties');p.replaceChildren();const o=element();const layer=allLayers().find(x=>x.key===selected);$('selectionName').textContent=layer?layer.title:'Select a layer';$('inspectorHint').textContent='';
 if(!o)return;
 if(selected==='background'){group('Artwork');if(model.id!=='custom-image'){control('Show existing background','showBackground','checkbox',model.showBackground);paintColor('Background colour','backgroundFill',model);}else $('inspectorHint').textContent='Custom Image uses the customer’s photograph and contrast settings. Select Image area to resize it.';return;}
 const b=bounds();if(b){group('Position & dimensions');const grid=document.createElement('div');grid.className='prop-grid';p.append(grid);
 for(const [k,l] of [['x','X position'],['y','Y position'],['w','Width'],['h','Height']]){if(o.kind==='path'&&['w','h'].includes(k))continue;control(l,k,'number',Math.round(b[k]),{parent:grid,min:0,max:k==='y'||k==='h'?1200:900,apply:v=>moveBox(selected,{...bounds(),[k]:v})});}}
 if(selected.startsWith('zone:')||o.kind==='text'){
  group('Typography');if(o.kind==='text')control('Text','text','textarea',o.text);
  control('Font','family','select',o.family,{choices:FONTS.map((f,i)=>[f,fontLabels[i]])});
  number('Text size','size',o,12,200);number('Font weight','weight',o,100,900,100);
  paintColor('Text colour','ink',o);control('Alignment','align','select',o.align,{choices:[['left','Left'],['center','Centre'],['right','Right']]});
  number('Letter spacing','spacing',{spacing:o.spacing||0},0,20,.5);
  control('Italic','italic','checkbox',o.italic);control('Uppercase','upper','checkbox',o.upper);
  if(selected.startsWith('zone:'))control('Hide field','hidden','checkbox',o.hidden);
  if(model.id==='custom-image'&&selected.startsWith('zone:'))control('Use this colour instead of customer contrast','useTemplateInk','checkbox',o.useTemplateInk);
 }
 if(selected.startsWith('panel:')||['rect','ellipse','path','line'].includes(o.kind)){
  group('Fill & border');if(o.fill!==undefined)paintColor('Fill','fill',o);paintColor('Border colour','stroke',o);number('Border width','sw',o,0,30,.5);
  if(o.rx!==undefined)number('Corner radius','rx',o,0,200);
 }
 if(selected.startsWith('panel:')&&o.key!=='image'){
  group('Label & spacing');control('Label','label','text',o.label);paintColor('Label colour','labelInk',o);paintColor('Icon colour','accent',o);paintColor('Divider colour','divider',o);paintColor('Icon background','iconBg',o);
  number('Icon gutter','gutter',o,0,Math.max(0,o.w-1));number('Label height','labelH',o,0,Math.max(0,o.h-1));
  $('inspectorHint').textContent='Moving a panel moves its text field. Select the text layer to fine-tune text spacing independently.';
 }
 if(selected==='photo'){group('Image frame');if(!o.full){paintColor('Image backing','frame',o);number('Corner radius','radius',o,0,200);} $('inspectorHint').textContent='Resize the image area, not the customer image. Photo proportions stay intact. The frame moves with it.';}
 if(o.kind==='path')$('inspectorHint').textContent='This existing vector shape can be moved and recoloured. Its original path is retained.';
}
function selection(){
 const overlay=$('overlay');overlay.replaceChildren();if(!model||!$('guides').checked)return;const b=bounds();if(!b)return;
 const r=document.createElementNS(NS,'rect');for(const [k,v] of Object.entries({x:b.x,y:b.y,width:b.w,height:b.h,fill:'none',stroke:'#32d7ff','stroke-width':3,'stroke-dasharray':'8 5','vector-effect':'non-scaling-stroke'}))r.setAttribute(k,v);overlay.append(r);
 if(element()?.kind!=='path'){const handle=document.createElementNS(NS,'rect');for(const [k,v] of Object.entries({x:b.x+b.w-10,y:b.y+b.h-10,width:20,height:20,rx:4,fill:'#32d7ff',stroke:'#102b41','stroke-width':2}))handle.setAttribute(k,v);overlay.append(handle);}
}
function paint(){
 if(!model)return;const data=$('sample').value==='blank'?{}:$('sample').value==='long'?longer:typical;
 try{lastResult=renderPostScratchTemplate($('render'),model,data,{imageSrc:imageUrl||sampleImage,preview:true,guides:false,shade:45,textContrast:'light'});const warning=[];if(lastResult.errors.length)warning.push('Text does not fit: '+lastResult.errors.map(k=>names[k]||k).join(', '));if(lastResult.tiny.length)warning.push('Small text: '+lastResult.tiny.map(k=>names[k]||k).join(', '));$('warnings').textContent=warning.join(' · ')||'Drag a layer to move it. Drag the blue corner to resize.';}
 catch(e){$('warnings').textContent=e.message;}
 selection();
}
function point(e){const r=$('stage').getBoundingClientRect();return {x:(e.clientX-r.left)*900/r.width,y:(e.clientY-r.top)*1200/r.height};}
function hit(p){const found=allLayers().filter(l=>l.key!=='background'&&!l.off).map(l=>({key:l.key,b:bounds(l.key)})).filter(x=>x.b&&p.x>=x.b.x&&p.x<=x.b.x+x.b.w&&p.y>=x.b.y&&p.y<=x.b.y+x.b.h);found.sort((a,b)=>a.b.w*a.b.h-b.b.w*b.b.h);return found[0]?.key;}
$('stage').addEventListener('pointerdown',e=>{
 if(!model||busy||e.button!==0||!$('guides').checked)return;
 const p=point(e),b=bounds(),r=$('stage').getBoundingClientRect(),radius=23*900/r.width;
 const resize=b&&element()?.kind!=='path'&&Math.abs(p.x-b.x-b.w)<radius&&Math.abs(p.y-b.y-b.h)<radius;
 if(!resize){const target=hit(p);if(!target)return;select(target);}
 const start=bounds();if(!start)return;e.preventDefault();$('stage').focus({preventScroll:true});
 drag={key:selected,origin:p,start,resize,base:clone(model),changed:false};$('stage').setPointerCapture(e.pointerId);
});
$('stage').addEventListener('pointermove',e=>{if(!drag)return;const p=point(e),dx=p.x-drag.origin.x,dy=p.y-drag.origin.y;if(Math.abs(dx)+Math.abs(dy)<2&&!drag.changed)return;drag.changed=true;model=clone(drag.base);const b=drag.start;moveBox(drag.key,drag.resize?{...b,w:b.w+dx,h:b.h+dy}:{...b,x:b.x+dx,y:b.y+dy},b);if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});});
function finish(){if(!drag)return;if(drag.changed){undo.push(drag.base);if(undo.length>75)undo.shift();redo=[];changed();}drag=null;}
$('stage').addEventListener('pointerup',finish);$('stage').addEventListener('pointercancel',finish);
$('stage').addEventListener('keydown',e=>{const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];const b=bounds();if(!dir||!b||busy)return;e.preventDefault();remember();const step=e.shiftKey?10:1;moveBox(selected,{...b,x:b.x+dir[0]*step,y:b.y+dir[1]*step});changed();});
$('layers').addEventListener('click',e=>{const b=e.target.closest('[data-layer]');if(b)select(b.dataset.layer);});
$('add').addEventListener('click',()=>{$('addMenu').hidden=!$('addMenu').hidden;$('add').setAttribute('aria-expanded',String(!$('addMenu').hidden));});
$('addMenu').addEventListener('click',e=>{
 const kind=e.target.closest('[data-add]')?.dataset.add;if(!kind)return;remember();
 if(kind==='panel'){const base=defaultDesign(model.id);const missing=base.panels.find(x=>!model.panels.some(p=>p.key===x.key));if(!missing){undo.pop();status('All original panels are present.');return;}model.panels.push(missing);selected='panel:'+missing.key;}
 else if(kind==='illustration'){model.illustration=defaultDesign(model.id).illustration;selected='illustration';}
 else{const base={kind,x:275,y:520,w:350,h:100,fill:'#fff4d7',stroke:'#b58442',sw:3,rx:12};model.decor.push(kind==='line'?{kind,x1:270,y1:570,x2:630,y2:570,stroke:'#b58442',sw:3}:kind==='text'?{kind,x:220,y:520,w:460,h:100,text:'Your text',size:42,family:'Georgia, serif',weight:700,ink:'#222222',align:'center',spacing:0,noWordSplit:false}:base);selected='decor:'+(model.decor.length-1);}
 $('addMenu').hidden=true;$('add').setAttribute('aria-expanded','false');changed();
});
$('remove').addEventListener('click',()=>{const o=element();if(!o||selected==='background')return;remember();if(selected.startsWith('zone:'))o.hidden=!o.hidden;
 else if(selected.startsWith('decor:')){model.decor.splice(Number(selected.split(':')[1]),1);selected='zone:eventName';}
 else if(selected.startsWith('panel:')){model.panels=model.panels.filter(x=>x!==o);selected='zone:eventName';}
 else if(selected==='illustration'){model.illustration=null;selected='zone:eventName';}
 else{undo.pop();status('The customer image area must remain. Resize it or adjust its panel instead.');return;}changed();});
function reorder(delta){if(!selected.startsWith('decor:'))return;const i=Number(selected.split(':')[1]),j=i+delta;if(j<0||j>=model.decor.length)return;remember();[model.decor[i],model.decor[j]]=[model.decor[j],model.decor[i]];selected='decor:'+j;changed();}
$('layerUp').onclick=()=>reorder(1);$('layerDown').onclick=()=>reorder(-1);
function history(from,to){if(!from.length)return;to.push(clone(model));model=from.pop();if(!element())selected='zone:eventName';changed();}
$('undo').onclick=()=>history(undo,redo);$('redo').onclick=()=>history(redo,undo);
$('guides').onchange=selection;$('sample').onchange=paint;
$('sampleImage').onchange=()=>{const f=$('sampleImage').files[0];if(!f)return;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(f);paint();};
$('defaults').onclick=()=>{if(!model||!confirm('Restore the original design? You can undo before saving.'))return;remember();model=defaultDesign(model.id);selected='zone:eventName';changed();};
$('reload').onclick=()=>load(model.id);$('template').onchange=e=>load(e.target.value);
$('export').onclick=()=>{if(!model)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(model,null,2)],{type:'application/json'}));a.href=url;a.download=model.id+'-design.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onclick=()=>$('importFile').click();$('importFile').onchange=async()=>{try{const f=$('importFile').files[0];if(!f)return;const incoming=validateDesign(model.id,JSON.parse(await f.text()));remember();model=incoming;selected='zone:eventName';changed();status('Design imported. Save to publish.');}catch(e){status(e.message,true);}finally{$('importFile').value='';}};
async function save(){
 if(busy||!model)return;
 let valid;try{valid=validateDesign(model.id,model);}catch(e){status(e.message,true);return;}
 if(!token){$('authMessage').textContent='';$('auth').showModal();return;}
 busy=true;mark();status('Saving template…');
 try{
  const d=await response(await fetch('/api/template-designs/'+model.id,{method:'PUT',headers:apiHeaders(),body:JSON.stringify({revision,template:valid})}));
  model=d.template;revision=d.revision;saved=JSON.stringify(model);status('Saved. New staging page loads will use this design.');
 }catch(e){status(e.message,true);if(/token|secret/i.test(e.message)){token='';$('authMessage').textContent=e.message;$('auth').showModal();}}
 finally{busy=false;changed();}
}
$('save').onclick=save;$('authSave').onclick=async e=>{e.preventDefault();const input=$('token');token=input.value.trim();input.value='';if(!token){$('authMessage').textContent='Enter your admin token.';return;}
 try{await response(await fetch('/api/admin/template-designer',{headers:apiHeaders(),cache:'no-store'}));$('auth').close();await save();}
 catch(err){token='';$('authMessage').textContent=err.message;}};
window.addEventListener('beforeunload',e=>{if(model&&!clean()){e.preventDefault();e.returnValue='';}});
for(const t of POST_TEMPLATES){const o=document.createElement('option');o.value=t.id;o.textContent=t.name;$('template').append(o);}
load(POST_TEMPLATES[0].id,true);
