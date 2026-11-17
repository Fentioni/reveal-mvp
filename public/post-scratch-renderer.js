
/* 14 source-based editable portrait layouts and one full-image layout. Shared renderer for editor,
   owner review and paid recipient. Never use sample content as customer data. */
const NS='http://www.w3.org/2000/svg';
const val=x=>typeof x==='string'?x.trim():'';
function mk(name,attrs={},parent){const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))if(v!==undefined)n.setAttribute(k,String(v));if(parent)parent.append(n);return n;}
const safeLink=s=>{try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return val(s);return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));}
function time(s){if(!/^\d\d:\d\d$/.test(s||''))return val(s);const [h,m]=s.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' am':' pm');}
function join(...items){return items.map(val).filter(Boolean).join(' · ');}
function fields(data){return {...data,eventName:val(data.eventName),date:date(data.eventDate),time:time(data.eventTime),dateTime:join(date(data.eventDate),time(data.eventTime)),venueLine:[val(data.venue),val(data.venueAddress)].filter(Boolean).join('\n'),senderLine:val(data.sender)?'From '+val(data.sender):'',message:val(data.personalMessage),link:safeLink(data.ticketUrl)?'Open event link':''};}
const canvas=typeof document==='undefined'?null:document.createElement('canvas');
const ctx=canvas?.getContext('2d');
let uid=0;
const labels={sender:'From / host',eventName:'Reveal title',subtitle:'Subtitle',recipient:'Recipient',date:'Date',time:'Time',dateTime:'Date · Time',venueLine:'Venue / address',senderLine:'From / host',message:'Personal message',link:'Event link',venue:'Venue / destination',venueAddress:'Address / location'};
function fitText(value,zone){
 const {family,weight,w,h}=zone;const max=Math.min(zone.size,Math.floor(h*.84));
 const min=Math.min(max,Math.max(20,Math.round(max*.42)));
 sizeLoop: for(let size=max;size>=min;size--){
  const spacing=Math.min(zone.spacing||0,size*.07),leading=size*1.12;
  ctx.font=(zone.italic?'italic ':'')+weight+' '+size+'px '+family;
  const measure=s=>ctx.measureText(s).width+Math.max(0,[...s].length-1)*spacing;
  const limit=w-18;let lines=[];
  for(const paragraph of value.split('\n')){
   let row='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
    const next=row?row+' '+word:word;
    if(measure(next)<=limit){row=next;continue;}
    if(row){lines.push(row);row='';}
    if(measure(word)<=limit){row=word;continue;}
    if(zone.noWordSplit)continue sizeLoop;
    for(const letter of [...word]){if(row&&measure(row+letter)>limit){lines.push(row);row='';}row+=letter;}
   }if(row)lines.push(row);
  }
  if(lines.length&&lines.length*leading<=h-5&&lines.every(s=>measure(s)<=limit))return {lines,size,leading,spacing};
 }
 return {overflow:true};
}
function text(svg,zone,value,ghost=false){
 const v=zone.upper?value.toUpperCase():value;if(!v)return null;
 const fitted=fitText(v,zone);if(fitted.overflow)return zone.key;
 const {lines,size,leading,spacing}=fitted;
 const x=zone.align==='left'?zone.x+9:zone.align==='right'?zone.x+zone.w-9:zone.x+zone.w/2;
 const y=zone.y+(zone.h-lines.length*leading)/2+size*.85;
 const el=mk('text',{'data-field':zone.key,x,y,fill:zone.ink,'font-size':size,'font-family':zone.family,'font-weight':zone.weight,'font-style':zone.italic?'italic':'normal','text-anchor':zone.align==='left'?'start':zone.align==='right'?'end':'middle','letter-spacing':spacing,opacity:ghost?.65:1,style:zone.glow?'filter:drop-shadow(0 0 3px '+zone.glow+')':undefined,stroke:zone.outline||undefined,'stroke-width':zone.outline?1:undefined,'paint-order':zone.outline?'stroke fill':undefined},svg);
 lines.forEach((line,i)=>{const t=mk('tspan',{x,y:y+i*leading},el);t.textContent=line;});
 return null;
}
// Decorations, field frames and icons are vector components, never baked
// placeholder text. The user image is clipped to the defined photo zone.
function drawDecor(svg,items){
 for(const d of items||[]){
  if(d.kind==='rect')mk('rect',{x:d.x,y:d.y,width:d.w,height:d.h,fill:d.fill,stroke:d.stroke,'stroke-width':d.sw,rx:d.rx},svg);
  if(d.kind==='path')mk('path',{d:d.d,fill:d.fill,stroke:d.stroke,'stroke-width':d.sw,'stroke-linejoin':'round'},svg);
  if(d.kind==='line')mk('line',{x1:d.x1,y1:d.y1,x2:d.x2,y2:d.y2,stroke:d.stroke,'stroke-width':d.sw,'stroke-dasharray':d.dash},svg);
 }
}
function drawIcon(svg,key,cx,cy,size,ink){
 const paths={
  date:'M4 6H20V21H4Z M4 10H20 M8 3V8 M16 3V8 M8 14H10 M14 14H16 M8 17H10 M14 17H16',
  time:'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3 M12 7V12L16 14',
  venue:'M12 21S4 13 4 9A8 8 0 0 1 20 9C20 13 12 21 12 21Z M12 6A3 3 0 1 0 12 12A3 3 0 1 0 12 6',
  venueAddress:'M4 21V8H10V21 M10 21V3H20V21 M3 21H21 M13 7H16 M13 11H16 M13 15H16 M6 12H8 M6 16H8',
  sender:'M12 3A4 4 0 1 0 12 11A4 4 0 1 0 12 3 M4 21V18A8 8 0 0 1 20 18V21Z',
  recipient:'M9 3A4 4 0 1 0 9 11A4 4 0 1 0 9 3 M2 21V18A7 7 0 0 1 16 18V21Z M17 4A3 3 0 0 1 17 10 M18 14A6 6 0 0 1 22 20'
 };
 if(!paths[key])return;
 const g=mk('g',{transform:'translate('+(cx-size/2)+' '+(cy-size/2)+') scale('+(size/24)+')','data-layout-icon':key,fill:'none',stroke:ink,'stroke-width':1.8,'stroke-linecap':'round','stroke-linejoin':'round'},svg);
 mk('path',{d:paths[key]},g);
}
function drawPanels(svg,panels,values,src,guides){
 for(const p of panels||[]){
  const g=mk('g',{'data-layout-panel':p.key},svg);
  mk('rect',{x:p.x,y:p.y,width:p.w,height:p.h,rx:p.rx,fill:p.fill,stroke:p.stroke,'stroke-width':p.sw},g);
  if(p.key==='image')continue;
  if(p.icon){
   if(p.iconBg)mk('rect',{x:p.x+3,y:p.y+3,width:p.gutter-4,height:p.h-6,rx:Math.max(0,p.rx-3),fill:p.iconBg},g);
   drawIcon(g,p.icon,p.x+p.gutter/2,p.y+p.h/2,Math.min(39,p.gutter*.69,p.h*.65),p.accent);
   mk('line',{x1:p.x+p.gutter,y1:p.y+8,x2:p.x+p.gutter,y2:p.y+p.h-8,stroke:p.stroke,'stroke-width':1.6},g);
  }
  // The title and personal values remain editable. Field headings are part
  // of the layout, only printed for populated details (or editor guides).
  if(p.label&&(val(values[p.key])||guides)){
   const center=p.align==='center',start=p.x+p.gutter+13;
   const label=mk('text',{x:center?p.x+p.w/2:start,y:p.y+Math.min(22,p.labelH),fill:p.labelInk,'font-family':p.family,'font-size':Math.min(18,p.labelH*.78,Math.max(11,(p.w-p.gutter-26)/(p.label.length*.64))),'font-weight':700,'text-anchor':center?'middle':'start','letter-spacing':.65,'data-layout-label':p.key},g);
   label.textContent=p.label;
  }
 }
}
function drawPhoto(svg,defs,p,src,placeholder,id){
 if(!src&&!placeholder)return;
 const clip=mk('clipPath',{id},defs);mk('rect',{x:p.x,y:p.y,width:p.w,height:p.h,rx:p.radius||0},clip);
 if(p.full){if(src){mk('image',{href:src,x:0,y:0,width:900,height:1200,preserveAspectRatio:'xMidYMid slice'},svg);mk('rect',{x:0,y:0,width:900,height:1200,fill:'#100a05',opacity:.58},svg);}return;}
 const group=mk('g',{'clip-path':'url(#'+id+')','data-photo-slot':'true'},svg);
 mk('rect',{x:p.x,y:p.y,width:p.w,height:p.h,fill:p.frame||'#f6f3ed'},group);
 if(src)mk('image',{href:src,x:p.x,y:p.y,width:p.w,height:p.h,preserveAspectRatio:'xMidYMid meet'},group);
 else {const bg=p.frame||'#f6f3ed';text(group,{key:'image-placeholder',x:p.x+10,y:p.y+10,w:p.w-20,h:p.h-20,size:26,family:'Arial',weight:500,ink:bg==='#f6f3ed'?'#777':'#fff',align:'center'},'IMAGE PLACEHOLDER',true);}
}
export function renderPostScratchTemplate(container,template,data={},options={}){
 if(!template||!Array.isArray(template.zones))throw new Error('Choose a valid template.');
 const values=fields(data);const src=options.imageSrc||'';const preview=options.preview===true;const id='post-scratch-'+(++uid);
 const svg=mk('svg',{viewBox:'0 0 900 1200',width:1800,height:2400,role:'img','aria-label':values.eventName||'Personalised reveal',xmlns:NS,'data-post-template':template.id,style:'display:block;width:100%;height:auto;aspect-ratio:3/4;overflow:hidden;'});
 const defs=mk('defs',{},svg);
 if(template.id==='custom-image'){
  const position=/^x(?:Min|Mid|Max)Y(?:Min|Mid|Max)$/.test(options.imagePosition||'')?options.imagePosition:'xMidYMid';
  const darkText=options.textContrast==='dark';
  const tone=darkText?'#ffffff':'#10131b';
  const shade=Number.isFinite(Number(options.shade))?Math.max(0,Math.min(.9,Number(options.shade)/100)):.7;
  mk('rect',{x:0,y:0,width:900,height:1200,fill:darkText?'#e2e5e7':'#344454'},svg);
  if(src)mk('image',{'data-photo-slot':'true',href:src,x:0,y:0,width:900,height:1200,preserveAspectRatio:position+' slice'},svg);
  else if(preview&&options.guides){
   const g=mk('g',{'data-photo-placeholder':'true'},svg);
   mk('rect',{x:390,y:426,width:120,height:80,rx:10,stroke:darkText?'#55616c':'#f5f3ee','stroke-width':3,fill:'none'},g);
   mk('circle',{cx:475,cy:448,r:8,fill:darkText?'#55616c':'#f5f3ee'},g);
   mk('path',{d:'M394 493 L425 461 L448 481 L468 468 L505 500',stroke:darkText?'#55616c':'#f5f3ee','stroke-width':4,fill:'none'},g);
   text(g,{key:'upload-placeholder',x:65,y:516,w:770,h:50,size:26,family:'Arial',weight:600,ink:darkText?'#344454':'#ffffff',align:'center'},'UPLOAD YOUR FULL-CARD IMAGE');
  }
  if(src){const gradient=mk('linearGradient',{id:id+'-contrast',x1:'0%',y1:'0%',x2:'0%',y2:'100%'},defs);
   for(const [offset,factor] of [[0,1],[.24,1],[.33,.75],[.40,.08],[.46,.08],[.54,.80],[.67,1],[1,1]])mk('stop',{offset:String(offset*100)+'%','stop-color':tone,'stop-opacity':shade*factor},gradient);
   mk('rect',{'data-background-shading':'true',x:0,y:0,width:900,height:1200,fill:'url(#'+id+'-contrast)'},svg);
  }
 }else{
 mk('image',{href:options.backgroundSrc||template.image,x:0,y:0,width:900,height:1200,preserveAspectRatio:'xMidYMid meet'},svg);
 if(template.structured){
  drawDecor(svg,template.decor);
  drawPanels(svg,template.panels,values,src,options.guides===true);
  if(template.id==='pop-panels'){
   // Retain the original black-line DJ illustration in the left comic panel.
   const art=mk('svg',{x:40,y:220,width:236,height:260,viewBox:'145 355 405 380',preserveAspectRatio:'xMidYMid meet',overflow:'hidden'},svg);
   mk('image',{href:'/post-scratch-artwork/doodle-party.webp',x:0,y:0,width:900,height:1200,preserveAspectRatio:'none'},art);
  }
  if(template.photo&&(src||options.guides))drawPhoto(svg,defs,template.photo,src,options.guides===true,id+'-photo');
 }else if(template.photo?.full&&src){drawPhoto(svg,defs,template.photo,src,false,id+'-photo');
 // Preserve original decorative stars over the customer's full-bleed photograph.
 const top=mk('clipPath',{id:id+'-stars'},defs);mk('rect',{x:0,y:0,width:900,height:185},top);
 mk('image',{href:options.backgroundSrc||template.image,x:0,y:0,width:900,height:1200,preserveAspectRatio:'none','clip-path':'url(#'+id+'-stars)'},svg);
 }else if(template.photo&&(src||options.guides))drawPhoto(svg,defs,template.photo,src,options.guides===true,id+'-photo');
 }
 if(template.id==='editorial'&&!template.structured){const pts=[];for(let i=0;i<64;i++){const a=i*Math.PI/32,r=i%2?25:43;pts.push((724+Math.cos(a)*r)+','+(242+Math.sin(a)*r));}mk('polygon',{points:pts.join(' '),fill:'#e5e3da'},svg);}
 const zones=template.id==='custom-image'?template.zones.map(z=>({...z,ink:options.textContrast==='dark'?'#15212b':'#ffffff'})):template.zones;
 const errors=[],tiny=[],checks=[];
 for(const zone of zones){
  const value=val(values[zone.key]);const ghost=!value&&options.guides===true;
  if(!value&&!ghost)continue;
  const slot=mk('g',{'data-slot':zone.key},svg);
  const clip=mk('clipPath',{id:id+'-'+zone.key},defs);
  mk('rect',{x:zone.x,y:zone.y,width:zone.w,height:zone.h},clip);
  if(options.guides)mk('rect',{x:zone.x,y:zone.y,width:zone.w,height:zone.h,fill:'none',stroke:zone.ink,'stroke-opacity':'.65','stroke-width':1.2,'stroke-dasharray':'5 4'},slot);
  const inside=mk('g',{'clip-path':'url(#'+id+'-'+zone.key+')'},slot);
  const error=text(inside,zone,value||labels[zone.key]||zone.key,ghost);
  if(error&&!ghost){errors.push(zone.key);continue;}
  const node=inside.querySelector('text');if(node&&!ghost){checks.push({node,zone});if(Number(node.getAttribute('font-size'))<22)tiny.push(zone.key);}
 }
 // Measure glyphs at one canonical size. Browser font hinting at responsive
 // widths otherwise gives slightly different fit transforms in each page.
 const responsiveStyle=svg.getAttribute('style');
 svg.setAttribute('style','display:block;width:900px;height:1200px;position:absolute;visibility:hidden;');
 container.replaceChildren(svg);
 // Verify actual SVG glyph geometry in the browser, not only a canvas estimate.
 // SVG clipping is a final guarantee; reject rather than exporting hidden text.
 for(const {node,zone} of checks){
  if(!container.isConnected)continue;
  let b=node.getBBox();
  if(b.width>zone.w-6||b.height>zone.h-6){
   const scale=Math.min((zone.w-8)/b.width,(zone.h-8)/b.height);
   const size=Number(node.getAttribute('font-size'))*scale;
   if(size<18){errors.push(zone.key);node.remove();continue;}
   const cx=b.x+b.width/2,cy=b.y+b.height/2;
   node.setAttribute('transform',`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
   if(size<22&&!tiny.includes(zone.key))tiny.push(zone.key);
   b=node.getBBox();
   // The transformed bounds are used for re-centring below.
   b={x:cx+(b.x-cx)*scale,y:cy+(b.y-cy)*scale,width:b.width*scale,height:b.height*scale};
  }
  const dx=b.x<zone.x+3?zone.x+3-b.x:b.x+b.width>zone.x+zone.w-3?zone.x+zone.w-3-b.x-b.width:0;
  const dy=b.y<zone.y+3?zone.y+3-b.y:b.y+b.height>zone.y+zone.h-3?zone.y+zone.h-3-b.y-b.height:0;
  if(dx||dy)node.setAttribute('transform',`translate(${dx} ${dy}) `+(node.getAttribute('transform')||''));
 }
 svg.setAttribute('style',responsiveStyle);
 return {svg,errors:[...new Set(errors)],tiny,bookingUrl:safeLink(data.ticketUrl)};
}

