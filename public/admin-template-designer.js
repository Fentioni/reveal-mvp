import {POST_TEMPLATES} from './post-scratch-catalogue.js?v=layout-flow-2';
import {defaultDesign,validateDesign,assertTemplateLayout,clone,FONTS,ARTWORK_CHOICES,MAX_ARTWORK_DATA} from './template-design-schema.js?v=template-management-2';
import {renderPostScratchTemplate,templateArtworkSource} from './post-scratch-renderer.js?v=template-management-1';
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
let catalogue=[],catalogueReady=false,pendingAdmin=null;
let sampleOverrides={};
const sampleKey={eventName:'eventName',subtitle:'subtitle',recipient:'recipient',sender:'sender',senderLine:'sender',date:'eventDate',time:'eventTime',venue:'venue',venueAddress:'venueAddress',message:'personalMessage',link:'ticketUrl'};
function sampleData(){return {...($('sample').value==='blank'?{}:$('sample').value==='long'?longer:typical),...sampleOverrides};}
function snapshot(){return {model:clone(model),sampleOverrides:{...sampleOverrides},sampleMode:$('sample').value,selected};}
function pushHistory(entry){undo.push(entry);if(undo.length>75)undo.shift();redo=[];}
function textEditable(){const o=model&&element();return !!o&&(selected.startsWith('zone:')||o.kind==='text'||(selected.startsWith('panel:')&&o.key!=='image'));}

const baseDesign=id=>defaultDesign(id,catalogue.find(t=>t.id===id));
const validate=(id,design)=>validateDesign(id,design,catalogue.find(t=>t.id===id));
function clean(){return JSON.stringify(model)===saved;}
function mark(){document.querySelector('.studio').inert=busy;$('reload').disabled=busy;$('coverManager').disabled=busy;$('artworkShortcut').disabled=busy;$('defaults').disabled=busy;$('export').disabled=busy;$('import').disabled=busy;$('newTemplate').disabled=busy||!catalogueReady;$('deleteTemplate').disabled=busy||!model||!catalogueReady||catalogue.filter(t=>!t.archived).length<=1;if(!model){$('save').disabled=true;$('template').disabled=true;$('editText').disabled=true;$('undo').disabled=true;$('redo').disabled=true;return;}$('editText').disabled=busy||!textEditable();$('revision').textContent=(revision==='base'?'Original template':'Saved version '+revision.slice(0,8))+(clean()?' · No unsaved changes':' · Unsaved changes');$('undo').disabled=!undo.length||busy;$('redo').disabled=!redo.length||busy;$('save').disabled=busy||clean();$('template').disabled=busy;}
function remember(){pushHistory(snapshot());}
function changed(full=true){mark();paint();if(full){layers();inspector();}}
function apiHeaders(){return {'Authorization':'Bearer '+token,'Content-Type':'application/json'};}
async function response(r){const body=await r.json().catch(()=>({}));if(!r.ok)throw Error(body.error||'Request failed ('+r.status+')');return body;}
async function load(id,force=false){
 if(model&&!clean()&&!force&&!confirm('Discard your unsaved changes?')){$('template').value=model.id;return;}
 const run=++requestId;busy=true;mark();status('Loading '+catalogue.find(t=>t.id===id)?.name+'…');
 try{const d=await response(await fetch('/api/template-designs/'+id,{cache:'no-store'}));if(run!==requestId)return;model=d.template||baseDesign(id);revision=d.revision||'base';status('Template loaded.');}
 catch(e){if(run!==requestId)return;model=baseDesign(id);revision='base';status('Using original template: '+e.message,true);}
 if(run!==requestId)return;undo=[];redo=[];sampleOverrides={};saved=JSON.stringify(model);$('photoOrientation').value='auto';selected='zone:eventName';busy=false;$('template').value=id;changed();
}
function allLayers(){
 const a=[...model.zones.map(z=>({key:'zone:'+z.key,title:names[z.key]||z.key,type:'Text',off:z.hidden})),{key:'photo',title:'Image area',type:'Image'}];
 a.push(...model.panels.map(p=>({key:'panel:'+p.key,title:(names[p.key]||'Image')+' panel',type:'Panel'})));
 if(model.illustration)a.push({key:'illustration',title:'DJ illustration',type:'Artwork'});
 a.push(...model.decor.map((d,i)=>({key:'decor:'+i,title:d.kind==='text'?d.text.slice(0,28):d.kind[0].toUpperCase()+d.kind.slice(1)+' '+(i+1),type:d.kind==='text'?'Text':'Shape'})));
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
 const o=element();$('remove').disabled=!o||selected==='background'||selected==='photo'||selected.startsWith('zone:');$('remove').textContent=o?.hidden?'Show field':'Remove / hide';
 const index=selected.startsWith('decor:')?Number(selected.split(':')[1]):-1;
 $('layerUp').disabled=index<0||index===model.decor.length-1;$('layerDown').disabled=index<=0;
 $('restoreArt').hidden=!!model.illustration||!baseDesign(model.id).illustration;
}
function select(key){if(!element(key))return;selected=key;mark();layers();inspector();selection();}
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
 if(options.maxLength)input.maxLength=options.maxLength;
 const valueFromInput=()=>type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;
 const apply=v=>{if(options.apply)options.apply(v);else element()[key]=v;};
 if(options.live){
  // One history entry per typing session; never rebuild the inspector while typing.
  let before=null;
  input.addEventListener('focus',()=>{before=null;});
  input.addEventListener('input',()=>{if(busy||!model)return;const v=valueFromInput();if(!before){before=snapshot();pushHistory(before);}apply(v);mark();paint();layers();});
  input.addEventListener('blur',()=>{before=null;});
 }else input.addEventListener('change',()=>{const v=valueFromInput();if(type==='number'&&!Number.isFinite(v))return;remember();apply(v);changed();});
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
 if(selected==='background'){
  group('Template artwork');
  const source=templateArtworkSource(model);
  if(source){const preview=document.createElement('img');preview.className='artwork-thumb';preview.alt='Current template background';preview.src=source;p.append(preview);}
  const info=document.createElement('p');info.className='muted';info.textContent='Replace the background behind the editable fields. Recommended: 1800 × 2400 px (3:4). JPEG, PNG or WebP, up to 10 MB.';p.append(info);
  const fileLabel=document.createElement('label');fileLabel.htmlFor='artworkUpload';fileLabel.textContent='Upload new template artwork';fileLabel.className='artwork-file-label';
  const upload=document.createElement('input');upload.id='artworkUpload';upload.type='file';upload.accept='image/jpeg,image/png,image/webp';p.append(fileLabel,upload);
  upload.onchange=async()=>{
   const f=upload.files?.[0];if(!f)return;const id=model.id;busy=true;mark();status('Preparing template artwork…');
   try{const data=await prepareArtwork(f);if(model.id!==id)return;
    remember();model.artworkSource='upload';model.artworkData=data;model.showBackground=true;
    if(model.id==='custom-image')$('showSampleImage').checked=false;
    status('New artwork ready. Save template to publish.');
   }catch(e){status(e.message,true);}finally{busy=false;changed();}
  };
  control('Choose existing artwork','artworkSource','select',model.artworkSource||'original',{choices:[['original','Original artwork'],...(model.artworkSource==='upload'?[['upload','Uploaded artwork']]:[]),...ARTWORK_CHOICES.map(a=>[a.id,a.name])],apply:v=>{model.artworkSource=v;if(v!=='upload')model.artworkData='';model.showBackground=true;if(model.id==='custom-image')$('showSampleImage').checked=false;}});
  control('Artwork fit','artworkFit','select',model.artworkFit||'contain',{choices:[['contain','Fit whole artwork'],['cover','Fill entire card']]});
  control('Show background artwork','showBackground','checkbox',model.showBackground);
  paintColor('Background colour','backgroundFill',model);
  const restore=document.createElement('button');restore.id='restoreArtwork';restore.textContent='Restore original artwork';restore.className='restore-artwork';restore.onclick=()=>{remember();Object.assign(model,{artworkSource:'original',artworkData:'',artworkFit:'contain',showBackground:true,backgroundFill:baseDesign(model.id).backgroundFill});changed();status('Original artwork restored. Save to publish.');};p.append(restore);
  $('inspectorHint').textContent=model.id==='custom-image'?'The customer’s full-card photo sits above the background. Disable Show customer photo to inspect the artwork by itself.':'Artwork replacement leaves all editable positions and panels unchanged. Select a panel to change its fill or transparency.';
  return;
 }
 if(selected.startsWith('zone:')||o.kind==='text'||(selected.startsWith('panel:')&&o.key!=='image')){
   group('Edit text');
   if(selected.startsWith('zone:')){
    const key=sampleKey[o.key];
    if(key){
     control(o.key==='link'?'Preview event URL':'Preview text','sampleText',o.key==='message'?'textarea':'text',sampleData()[key]||'',{live:true,maxLength:1000,apply:v=>{sampleOverrides[key]=v;}});
     const note=document.createElement('p');note.className='muted text-help';note.textContent='Preview only. Actual customer text is supplied when creating a reveal; font and layout changes are saved with the template.';p.append(note);
     const reset=document.createElement('button');reset.type='button';reset.id='resetSampleText';reset.textContent='Reset preview text';reset.onclick=()=>{if(!Object.keys(sampleOverrides).length)return;remember();sampleOverrides={};changed();};p.append(reset);
    }
   }else if(o.kind==='text')control('Fixed template text','text','textarea',o.text,{live:true,maxLength:300});
   else control('Fixed panel label','label','text',o.label,{live:true,maxLength:80});
  }
  const b=bounds();if(b){group('Position & dimensions');const grid=document.createElement('div');grid.className='prop-grid';p.append(grid);
 for(const [k,l] of [['x','X position'],['y','Y position'],['w','Width'],['h','Height']]){if(o.kind==='path'&&['w','h'].includes(k))continue;control(l,k,'number',Math.round(b[k]),{parent:grid,min:0,max:k==='y'||k==='h'?1200:900,apply:v=>moveBox(selected,{...bounds(),[k]:v})});}}
 if(selected.startsWith('zone:')||o.kind==='text'){
  group('Typography');
  control('Font','family','select',o.family,{choices:FONTS.map((f,i)=>[f,fontLabels[i]])});
  number('Text size','size',o,12,200);number('Font weight','weight',o,100,900,100);
  paintColor('Text colour','ink',o);control('Alignment','align','select',o.align,{choices:[['left','Left'],['center','Centre'],['right','Right']]});
  number('Letter spacing','spacing',{spacing:o.spacing||0},0,20,.5);
  control('Italic','italic','checkbox',o.italic);control('Uppercase','upper','checkbox',o.upper);
  
  if(model.id==='custom-image'&&selected.startsWith('zone:'))control('Use this colour instead of customer contrast','useTemplateInk','checkbox',o.useTemplateInk);
 }
 if(selected.startsWith('panel:')||['rect','ellipse','path','line'].includes(o.kind)){
  group('Fill & border');if(o.fill!==undefined)paintColor('Fill','fill',o);paintColor('Border colour','stroke',o);number('Border width','sw',o,0,30,.5);
  if(o.rx!==undefined)number('Corner radius','rx',o,0,200);
 }
 if(selected.startsWith('panel:')&&o.key!=='image'){
  group('Label & spacing');paintColor('Label colour','labelInk',o);paintColor('Icon colour','accent',o);paintColor('Divider colour','divider',o);paintColor('Icon background','iconBg',o);
  number('Icon gutter','gutter',o,0,Math.max(0,o.w-1));number('Label height','labelH',o,0,Math.max(0,o.h-1));
  $('inspectorHint').textContent='Moving a panel moves its text field. Select the text layer to fine-tune text spacing independently.';
 }
 if(selected==='photo'){group('Image frame');if(!o.full){paintColor('Image backing','frame',o);number('Corner radius','radius',o,0,200);} $('inspectorHint').textContent='Resize the image area, not the customer image. Photo proportions stay intact. The frame moves with it.';}
 if(o.kind==='path')$('inspectorHint').textContent='This existing vector shape can be moved and recoloured. Its original path is retained.';
}
function selection(){
 const overlay=$('overlay');overlay.replaceChildren();if(!model||!$('guides').checked)return;for(const layer of allLayers().filter(l=>l.key.startsWith('zone:')||l.key==='photo')){const q=bounds(layer.key);if(!q||layer.key===selected)continue;const guide=document.createElementNS(NS,'rect');for(const [k,v] of Object.entries({x:q.x,y:q.y,width:q.w,height:q.h,fill:'none',stroke:'#32d7ff','stroke-opacity':'.4','stroke-width':1.5,'stroke-dasharray':'5 5','vector-effect':'non-scaling-stroke'}))guide.setAttribute(k,v);overlay.append(guide);}const b=bounds();if(!b)return;
 const r=document.createElementNS(NS,'rect');for(const [k,v] of Object.entries({x:b.x,y:b.y,width:b.w,height:b.h,fill:'none',stroke:'#32d7ff','stroke-width':3,'stroke-dasharray':'8 5','vector-effect':'non-scaling-stroke'}))r.setAttribute(k,v);overlay.append(r);
 if(element()?.kind!=='path'){const handle=document.createElementNS(NS,'rect');for(const [k,v] of Object.entries({x:b.x+b.w-10,y:b.y+b.h-10,width:20,height:20,rx:4,fill:'#32d7ff',stroke:'#102b41','stroke-width':2}))handle.setAttribute(k,v);overlay.append(handle);}
}
async function prepareArtwork(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPEG, PNG or WebP image no larger than 10 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight)throw Error('The artwork could not be read.');
  const canvas=document.createElement('canvas');
  let scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
  for(let n=0;n<5;n++){
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   for(const q of [.92,.83,.72,.60]){
    const data=canvas.toDataURL('image/webp',q);if(/^data:image\/(webp|png);base64,/.test(data)&&data.length<=MAX_ARTWORK_DATA)return data;
   }
   scale*=.8;
  }
  throw Error('Artwork is too detailed to save. Try a smaller image.');
 }catch(e){throw Error(e.message||'The artwork could not be read.');}finally{URL.revokeObjectURL(url);}
}
function paint(){
 if(!model)return;const data=sampleData();
 try{lastResult=renderPostScratchTemplate($('render'),model,data,{imageSrc:$('showSampleImage').checked?(imageUrl||sampleImage):'',preview:true,guides:$('sample').value==='blank',imageOrientation:$('photoOrientation').value,shade:45,textContrast:'light'});const warning=[];try{assertTemplateLayout(model);}catch(e){warning.push(e.message);}if(lastResult.errors.length)warning.push('Text does not fit: '+lastResult.errors.map(k=>names[k]||k).join(', '));if(lastResult.tiny.length)warning.push('Small text: '+lastResult.tiny.map(k=>names[k]||k).join(', '));$('warnings').textContent=warning.join(' · ')||'Drag a layer to move it. Drag the blue corner to resize.';}
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
 drag={key:selected,origin:p,start,resize,base:clone(model),history:snapshot(),changed:false};$('stage').setPointerCapture(e.pointerId);
});
$('stage').addEventListener('pointermove',e=>{if(!drag)return;const p=point(e),dx=p.x-drag.origin.x,dy=p.y-drag.origin.y;if(Math.abs(dx)+Math.abs(dy)<2&&!drag.changed)return;drag.changed=true;model=clone(drag.base);const b=drag.start;moveBox(drag.key,drag.resize?{...b,w:b.w+dx,h:b.h+dy}:{...b,x:b.x+dx,y:b.y+dy},b);if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});});
function finish(){if(!drag)return;if(drag.changed){pushHistory(drag.history);changed();}drag=null;}
$('stage').addEventListener('pointerup',finish);$('stage').addEventListener('pointercancel',finish);
$('stage').addEventListener('keydown',e=>{const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];const b=bounds();if(!dir||!b||busy)return;e.preventDefault();remember();const step=e.shiftKey?10:1;moveBox(selected,{...b,x:b.x+dir[0]*step,y:b.y+dir[1]*step});changed();});
$('layers').addEventListener('click',e=>{const b=e.target.closest('[data-layer]');if(b)select(b.dataset.layer);});
$('add').addEventListener('click',()=>{$('addMenu').hidden=!$('addMenu').hidden;$('add').setAttribute('aria-expanded',String(!$('addMenu').hidden));});
$('addMenu').addEventListener('click',e=>{
 const kind=e.target.closest('[data-add]')?.dataset.add;if(!kind)return;
 if(kind==='panel'){const base=baseDesign(model.id);const missing=base.panels.find(x=>!model.panels.some(p=>p.key===x.key));if(!missing){status('All original panels are present.');return;}remember();model.panels.push(missing);selected='panel:'+missing.key;}
 else if(kind==='illustration'){remember();model.illustration=baseDesign(model.id).illustration;selected='illustration';}
 else{remember();const base={kind,x:275,y:520,w:350,h:100,fill:'#fff4d7',stroke:'#b58442',sw:3,rx:12};model.decor.push(kind==='line'?{kind,x1:270,y1:570,x2:630,y2:570,stroke:'#b58442',sw:3}:kind==='text'?{kind,x:220,y:520,w:460,h:100,text:'Your text',size:42,family:'Georgia, serif',weight:700,ink:'#222222',align:'center',spacing:0,noWordSplit:false}:base);selected='decor:'+(model.decor.length-1);}
 $('addMenu').hidden=true;$('add').setAttribute('aria-expanded','false');changed();
});
$('remove').addEventListener('click',()=>{const o=element();if(!o||selected==='background'||selected==='photo'||selected.startsWith('zone:'))return;remember();if(selected.startsWith('zone:'))o.hidden=false;
 else if(selected.startsWith('decor:')){model.decor.splice(Number(selected.split(':')[1]),1);selected='zone:eventName';}
 else if(selected.startsWith('panel:')){model.panels=model.panels.filter(x=>x!==o);selected='zone:eventName';}
 else if(selected==='illustration'){model.illustration=null;selected='zone:eventName';}
 else{undo.pop();status('The customer image area must remain. Resize it or adjust its panel instead.');return;}changed();});
function reorder(delta){if(!selected.startsWith('decor:'))return;const i=Number(selected.split(':')[1]),j=i+delta;if(j<0||j>=model.decor.length)return;remember();[model.decor[i],model.decor[j]]=[model.decor[j],model.decor[i]];selected='decor:'+j;changed();}
$('layerUp').onclick=()=>reorder(1);$('layerDown').onclick=()=>reorder(-1);
function history(from,to){if(busy||drag||!model||!from.length)return;to.push(snapshot());const state=from.pop();model=state.model;sampleOverrides=state.sampleOverrides;$('sample').value=state.sampleMode;selected=state.selected;if(!element())selected='zone:eventName';changed();status(from===undo?'Last action undone.':'Action redone.');}
$('undo').onclick=()=>history(undo,redo);$('redo').onclick=()=>history(redo,undo);
function editSelectedText(){if(!textEditable()||busy)return;const input=$('prop-sampleText')||$('prop-text')||$('prop-label');if(!input)return;input.scrollIntoView({block:'nearest'});input.focus({preventScroll:true});input.select();}
$('editText').onclick=editSelectedText;
$('stage').addEventListener('dblclick',()=>editSelectedText());
$('layers').addEventListener('dblclick',e=>{const b=e.target.closest('[data-layer]');if(b)editSelectedText();});
document.addEventListener('keydown',e=>{
 if(!model||busy||e.defaultPrevented||document.querySelector('dialog[open]'))return;
 if((e.ctrlKey||e.metaKey)&&!e.altKey){
  const k=e.key.toLowerCase();
  if(k==='z'||k==='y'){e.preventDefault();if(k==='y'||e.shiftKey)history(redo,undo);else history(undo,redo);}
 }
 if(e.key==='Enter'&&e.target===$('stage')&&textEditable()){e.preventDefault();editSelectedText();}
});
$('guides').onchange=selection;$('sample').onchange=()=>{sampleOverrides={};changed();};$('photoOrientation').onchange=paint;$('showSampleImage').onchange=paint;
$('artworkShortcut').onclick=()=>{select('background');if(innerWidth<850)document.querySelector('.inspector').scrollIntoView({block:'start',behavior:'smooth'});};
$('sampleImage').onchange=()=>{const f=$('sampleImage').files[0];if(!f)return;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(f);paint();};
$('defaults').onclick=()=>{if(!model||!confirm('Restore the original design? You can undo before saving.'))return;remember();model=baseDesign(model.id);selected='zone:eventName';changed();};
$('reload').onclick=()=>load(model.id);$('template').onchange=e=>load(e.target.value);
$('export').onclick=()=>{if(!model)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(model,null,2)],{type:'application/json'}));a.href=url;a.download=model.id+'-design.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onclick=()=>$('importFile').click();$('importFile').onchange=async()=>{try{const f=$('importFile').files[0];if(!f)return;const incoming=validate(model.id,JSON.parse(await f.text()));remember();model=incoming;selected='zone:eventName';changed();status('Design imported. Save to publish.');}catch(e){status(e.message,true);}finally{$('importFile').value='';}};
async function save(){
 if(busy||!model)return;
 let valid;try{valid=assertTemplateLayout(validate(model.id,model));}catch(e){status(e.message,true);return;}
 if(!token){requireAdmin(save);return;}
 busy=true;mark();status('Saving template…');
 try{
  const d=await response(await fetch('/api/template-designs/'+model.id,{method:'PUT',headers:apiHeaders(),body:JSON.stringify({revision,template:valid})}));
  model=d.template;revision=d.revision;saved=JSON.stringify(model);status('Saved. New staging page loads will use this design.');
 }catch(e){status(e.message,true);if(/token|secret/i.test(e.message)){token='';requireAdmin(save,e.message);}}
 finally{busy=false;changed();}
}
$('save').onclick=save;$('authSave').onclick=async e=>{e.preventDefault();const input=$('token');token=input.value.trim();input.value='';if(!token){$('authMessage').textContent='Enter your admin token.';return;}
 $('authSave').disabled=true;
 try{await response(await fetch('/api/admin/template-designer',{headers:apiHeaders(),cache:'no-store'}));$('auth').close();const action=pendingAdmin;pendingAdmin=null;if(action)await action();}
 catch(err){token='';$('authMessage').textContent=err.message;}finally{$('authSave').disabled=false;}};
window.addEventListener('beforeunload',e=>{if(model&&!clean()){e.preventDefault();e.returnValue='';}});
function requireAdmin(action,message=''){pendingAdmin=action;$('authMessage').textContent=message;$('auth').showModal();}
async function refreshCatalogue(){
 const result=await response(await fetch('/api/template-catalogue',{cache:'no-store'}));
 catalogue=result.templates;catalogueReady=true;
 const groups=new Map();$('template').replaceChildren();
 for(const t of catalogue.filter(t=>!t.archived)){const label=t.collection||'Existing templates';if(!groups.has(label)){const g=document.createElement('optgroup');g.label=label;$('template').append(g);groups.set(label,g);}const o=document.createElement('option');o.value=t.id;o.textContent=t.name;groups.get(label).append(o);}
 return catalogue.filter(t=>!t.archived);
}
async function changeCatalogue(method,body){
 if(!token){requireAdmin(()=>changeCatalogue(method,body));return;}
 busy=true;mark();status(method==='POST'?'Creating template…':'Deleting template…');
 try{
  const result=await response(await fetch('/api/template-catalogue',{method,headers:apiHeaders(),body:JSON.stringify(body)}));
  const active=await refreshCatalogue();
  await load(method==='POST'?result.id:active[0].id,true);
  status(method==='POST'?'New template created. Edit the design and save changes.':'Template deleted from the catalogue. Existing reveals are preserved.');
 }catch(e){status(e.message,true);if(/token|secret/i.test(e.message)){token='';requireAdmin(()=>changeCatalogue(method,body),e.message);}}
 finally{busy=false;mark();}
}
const startingLayouts=POST_TEMPLATES.filter(t=>t.id!=='custom-image');
for(const t of startingLayouts){const o=document.createElement('option');o.value=t.id;o.textContent=t.name;$('newTemplateBase').append(o);}
$('newTemplate').onclick=()=>{
 if(model&&!clean()&&!confirm('Discard unsaved changes and create a new template?'))return;
 $('newTemplateName').value='';$('newTemplateBlank').checked=true;
 const base=model?.baseId||model?.id;$('newTemplateBase').value=startingLayouts.some(t=>t.id===base)?base:startingLayouts[0].id;
 $('createTemplateDialog').showModal();$('newTemplateName').focus();
};
$('cancelNewTemplate').onclick=()=>$('createTemplateDialog').close();
$('createTemplateForm').onsubmit=e=>{e.preventDefault();const body={name:$('newTemplateName').value.trim(),baseId:$('newTemplateBase').value,blank:$('newTemplateBlank').checked};if(!body.name)return;$('createTemplateDialog').close();changeCatalogue('POST',body);};
$('deleteTemplate').onclick=()=>{if(!model||busy)return;const id=model.id;if(confirm('Delete "'+model.name+'" from the template catalogue? Existing reveals will retain their design.'+(!clean()?' Your unsaved edits will be discarded.':'')))changeCatalogue('DELETE',{id});};
(async()=>{busy=true;mark();try{const active=await refreshCatalogue();await load(active[0].id,true);}catch(e){catalogueReady=false;status('Could not load catalogue: '+e.message,true);busy=false;mark();}})();

let coverBusy=false,coverPreviewUrl='';
function coverStatus(text,error=false){$('coverStatus').textContent=text;$('coverStatus').classList.toggle('cover-error',error);}
function lockCovers(locked){
 coverBusy=locked;for(const control of $('coverManagerDialog').querySelectorAll('input,button'))control.disabled=locked;
}
function renderCoverList(artworks){
 for(const [archived,target] of [[false,'coverList'],[true,'archivedCoverList']]){
  const list=$(target);list.replaceChildren();const entries=artworks.filter(a=>!!a.archived===archived);
  for(const a of entries){
   const card=document.createElement('article');card.className='cover-item';card.dataset.coverId=a.id;
   const image=document.createElement('img');image.src=a.src;image.alt=a.label;image.loading='lazy';
   const name=document.createElement('strong');name.textContent=a.label;
   const button=document.createElement('button');button.type='button';button.textContent=archived?'Restore':'Delete';button.className=archived?'secondary':'danger';
   button.setAttribute('aria-label',(archived?'Restore ':'Delete ')+a.label);button.disabled=!archived&&entries.length<=1;
   button.onclick=()=>{if(coverBusy)return;if(archived||confirm('Delete "'+a.label+'" from the scratch artwork collection? Existing reveals will retain this cover.'))changeCover(archived?'PATCH':'DELETE',{id:a.id});};
   card.append(image,name,button);list.append(card);
  }
  if(!entries.length){const msg=document.createElement('p');msg.className='muted';msg.textContent=archived?'No deleted artwork.':'No cover artwork available.';list.append(msg);}
 }
 $('deletedCovers').querySelector('summary').textContent='Deleted artwork ('+artworks.filter(a=>a.archived).length+')';
}
async function refreshCovers(){
 const result=await response(await fetch('/api/scratch-artwork',{cache:'no-store'}));renderCoverList(result.artworks);return result;
}
async function changeCover(method,body){
 if(coverBusy)return;
 if(!token){requireAdmin(()=>changeCover(method,body));return;}
 lockCovers(true);coverStatus(method==='POST'?'Uploading artwork…':method==='PATCH'?'Restoring artwork…':'Deleting artwork…');
 try{
  const headers=method==='POST'?{'Authorization':'Bearer '+token}:apiHeaders();
  await response(await fetch('/api/scratch-artwork',{method,headers,body:method==='POST'?body:JSON.stringify(body)}));
  if(method==='POST'){$('coverUploadForm').reset();clearCoverPreview();}
  await refreshCovers();coverStatus(method==='POST'?'Artwork added. It is available to new creators.':method==='PATCH'?'Artwork restored.':'Artwork deleted from customer selection. Existing reveals are preserved.');
 }catch(e){coverStatus(e.message,true);if(/token|secret/i.test(e.message)){token='';requireAdmin(()=>changeCover(method,body),e.message);}}
 finally{lockCovers(false);const cards=$('coverList').querySelectorAll('.cover-item');if(cards.length===1)cards[0].querySelector('button').disabled=true;}
}
function clearCoverPreview(){if(coverPreviewUrl)URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl='';$('coverUploadPreview').removeAttribute('src');$('coverUploadPreview').hidden=true;}
$('coverFile').onchange=()=>{
 clearCoverPreview();const f=$('coverFile').files?.[0];if(!f)return;
 coverPreviewUrl=URL.createObjectURL(f);$('coverUploadPreview').src=coverPreviewUrl;$('coverUploadPreview').hidden=false;
 if(!$('coverName').value)$('coverName').value=f.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').slice(0,80);
};
$('coverUploadForm').onsubmit=async e=>{
 e.preventDefault();const f=$('coverFile').files?.[0],name=$('coverName').value.trim();if(coverBusy||!f||!name)return;
 if(f.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type)){coverStatus('Choose JPEG, PNG or WebP up to 10 MB.',true);return;}
 try{const bitmap=await createImageBitmap(f);const w=bitmap.width,h=bitmap.height;bitmap.close();if(w*4!==h*3||w<900||h>12000)throw Error('Choose a 3:4 portrait image, at least 900 × 1200 pixels.');}
 catch(e){coverStatus(e.message,true);return;}
 const form=new FormData();form.append('name',name);form.append('image',f);await changeCover('POST',form);
};
$('coverManager').onclick=async()=>{if(coverBusy)return;$('coverManagerDialog').showModal();coverStatus('Loading artwork…');lockCovers(true);try{const result=await refreshCovers();coverStatus(result.artworks.filter(a=>!a.archived).length+' active covers');}catch(e){coverStatus(e.message,true);}finally{lockCovers(false);const cards=$('coverList').querySelectorAll('.cover-item');if(cards.length===1)cards[0].querySelector('button').disabled=true;}};
$('closeCoverManager').onclick=()=>{if(!coverBusy)$('coverManagerDialog').close();};
$('coverManagerDialog').addEventListener('cancel',e=>{if(coverBusy)e.preventDefault();});
