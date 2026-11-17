/**
 * Reveal Concert Ticket — source-faithful print layouts.
 * Each preset has independent artwork geometry, taken from the five supplied
 * landscape ticket references. Only supplied user data is printed; admission
 * marks and barcode stripes are decorative, never booking references.
 * SVG viewBox guarantees the same composition in creator, owner and recipient.
 */
const NS='http://www.w3.org/2000/svg';
const W=2000,H=647;
const el=(name,attrs={},parent)=>{const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))if(v!==undefined&&v!==null)n.setAttribute(k,String(v));if(parent)parent.append(n);return n;};
const safe=s=>typeof s==='string'?s.trim():'';
const fallback=(a,b)=>safe(a)||safe(b);
const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
function fmtDate(s){const t=safe(s);if(!/^\d{4}-\d{2}-\d{2}$/.test(t))return t;try{return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(t+'T12:00:00Z'));}catch{return t;}}
function fmtTime(s){const t=safe(s);if(!/^\d\d:\d\d$/.test(t))return t;const [h,m]=t.split(':').map(Number);return h>23||m>59?t:(h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' AM':' PM');}
function rect(g,x,y,w,h,color,extra={}){return el('rect',{x,y,width:w,height:h,fill:color,...extra},g);}
function line(g,x1,y1,x2,y2,color,width=2,extra={}){return el('line',{x1,y1,x2,y2,stroke:color,'stroke-width':width,...extra},g);}
function circle(g,x,y,r,color,extra={}){return el('circle',{cx:x,cy:y,r,fill:color,...extra},g);}
function path(g,d,fill,extra={}){return el('path',{d,fill,...extra},g);}
function defs(svg){
 const d=el('defs',{},svg);
 const grad=(id,stops,attrs={x1:'0%',y1:'0%',x2:'100%',y2:'100%'})=>{const n=el('linearGradient',{id,...attrs},d);for(const [offset,color,opacity]of stops)el('stop',{offset,'stop-color':color,'stop-opacity':opacity??1},n);};
 grad('neon-bg',[['0%','#210052'],['52%','#660063'],['100%','#06001a']]);
 grad('lavender-bg',[['0%','#ffd8ed'],['48%','#b881f7'],['100%','#e4cbff']]);
 grad('pink-stub',[['0%','#ffc6db'],['100%','#faafce']]);
 grad('navy-bg',[['0%','#08172f'],['100%','#18335d']]);
 grad('black-stage',[['0%','#16151b'],['100%','#050508']]);
 grad('editorial-img',[['0%','#f9dce9'],['100%','#b04880']]);
 grad('photo-stage',[['0%','#27213e'],['55%','#4f275d'],['100%','#07091b']]);
 const cp=el('clipPath',{id:'image-clip'},d);rect(cp,0,0,W,H,'#fff');
 return d;
}
function type(g,s,x,y,{size=42,min=16,maxWidth=500,maxLines=1,leading=1.05,weight=700,fill='#fff',family='Arial, Helvetica, sans-serif',anchor='start',italic=false,spacing=0,stroke='',strokeWidth=1,uppercase=false,rotate=0}={}){
 let value=safe(s);if(!value)return;
 if(uppercase)value=value.toUpperCase();
 let font=size,lines=[];
 const wrap=()=>{ctx.font=(italic?'italic ':'')+weight+' '+font+'px '+family;let acc='',out=[];for(const word of value.split(/\s+/)){
  if(ctx.measureText(word).width>maxWidth&&acc===''){out.push(word);continue;}
  if(!acc)acc=word;
  else if(ctx.measureText(acc+' '+word).width<=maxWidth)acc+=' '+word;
  else{out.push(acc);acc=word;}
 }if(acc)out.push(acc);return out;};
 do{lines=wrap();if(lines.length<=maxLines&&lines.every(t=>ctx.measureText(t).width<=maxWidth+1))break;font-=2;}while(font>min);
 if(font<min)font=min;
 lines=wrap();
 if(lines.length>maxLines){
   const kept=lines.slice(0,maxLines);
   const tail=lines.slice(maxLines-1).join(' ');
   kept[maxLines-1]=tail;
   ctx.font=(italic?'italic ':'')+weight+' '+font+'px '+family;
   while(kept[maxLines-1].length>1&&ctx.measureText(kept[maxLines-1]+'…').width>maxWidth)kept[maxLines-1]=kept[maxLines-1].slice(0,-1);
   kept[maxLines-1]+='…';lines=kept;
 }
 const group=el('g',rotate?{transform:'rotate('+rotate+' '+x+' '+y+')'}:{},g);
 for(let i=0;i<lines.length;i++){
  const t=el('text',{x,y:y+font*(1+i*leading),'font-family':family,'font-size':font,'font-weight':weight,'font-style':italic?'italic':'normal','letter-spacing':spacing,fill,'text-anchor':anchor,'paint-order':'stroke',stroke:stroke||'none','stroke-width':strokeWidth},group);
  t.textContent=lines[i];
 }
 return group;
}
function barcode(g,x,y,w,h,ink,orientation='vertical'){
 const group=el('g',{opacity:.96},g);const units=orientation==='vertical'?w:h;let cursor=0,i=0;
 while(cursor<units-2){const width=[2,5,3,2,7,2,4,2,8,3,2,6][i%12];if(i%3!==1){if(orientation==='vertical')rect(group,x+cursor,y,Math.min(width,w-cursor),h,ink);else rect(group,x,y+cursor,w,Math.min(width,h-cursor),ink);}cursor+=width+1;i++;}
}
function photo(svg,x,y,w,h,src,{tint='',opacity=1}={}){
 const id='crop'+Math.round(x)+Math.round(y);
 const d=svg.querySelector('defs');const cp=el('clipPath',{id},d);rect(cp,x,y,w,h,'#fff');
 const g=el('g',{'clip-path':'url(#'+id+')'},svg);
 if(safe(src))el('image',{href:src,x,y,width:w,height:h,preserveAspectRatio:'xMidYMid slice',opacity},g);
 else{
  rect(g,x,y,w,h,'url(#photo-stage)');
  // Self-contained stage artwork: nested external SVG image resources are
  // suppressed by some Safari/Chromium SVG security contexts.
  // This draws the lighting and performer directly, so no blank picture box.
  path(g,'M'+(x+w*.10)+' '+y+' L'+(x+w*.73)+' '+(y+h)+' L'+(x+w*.98)+' '+(y+h)+' L'+(x+w*.29)+' '+y+'Z','#e86abd',{opacity:.22});
  path(g,'M'+(x+w*.90)+' '+y+' L'+(x+w*.03)+' '+(y+h)+' L'+(x+w*.28)+' '+(y+h)+' L'+(x+w*.96)+' '+y+'Z','#68bdea',{opacity:.20});
  circle(g,x+w*.23,y+h*.14,Math.max(6,w*.055),'#ffe7ab',{opacity:.60});
  circle(g,x+w*.82,y+h*.09,Math.max(5,w*.040),'#e0baff',{opacity:.48});
  path(g,'M'+x+' '+(y+h)+' L'+x+' '+(y+h*.83)+' Q'+(x+w*.16)+' '+(y+h*.64)+' '+(x+w*.29)+' '+(y+h*.86)+' Q'+(x+w*.37)+' '+(y+h*.60)+' '+(x+w*.50)+' '+(y+h*.87)+' Q'+(x+w*.75)+' '+(y+h*.64)+' '+(x+w)+' '+(y+h*.87)+' L'+(x+w)+' '+(y+h)+'Z','#0a081a',{opacity:.87});
  circle(g,x+w*.51,y+h*.39,Math.min(w*.13,h*.12),'#100d1c',{opacity:.96});
  path(g,'M'+(x+w*.35)+' '+(y+h*.90)+' L'+(x+w*.40)+' '+(y+h*.55)+' Q'+(x+w*.50)+' '+(y+h*.48)+' '+(x+w*.62)+' '+(y+h*.56)+' L'+(x+w*.70)+' '+(y+h*.92)+'Z','#0d0b19',{opacity:.98});
  line(g,x+w*.66,y+h*.26,x+w*.64,y+h*.82,'#a7aec5',Math.max(2,w*.010),{opacity:.80});
  circle(g,x+w*.66,y+h*.27,Math.max(3,w*.025),'#d5ccdd',{opacity:.90});
  path(g,'M'+(x+w*.31)+' '+(y+h*.68)+' Q'+(x+w*.56)+' '+(y+h*.54)+' '+(x+w*.71)+' '+(y+h*.68)+' Q'+(x+w*.70)+' '+(y+h*.86)+' '+(x+w*.41)+' '+(y+h*.79)+'Z','#56204b',{opacity:.95,stroke:'#bb80a9','stroke-width':Math.max(1,w*.005)});
 }
 if(tint)rect(g,x,y,w,h,tint,{opacity:.35});
 return g;
}
function bokeh(g){
 for(let i=0;i<16;i++){const x=460+(i*311)%1550,y=50+(i*127)%600,r=12+(i*19)%70;
  circle(g,x,y,r,i%2?'#ffffff':'#ffa2e0',{opacity:i%4===0?.55:.22});
 }
}
function seat(g,fields,x,y,w=300,ink='#fff',size=33){
 const values=[['GATE',fields.gate],['ROW',fields.row],['SEAT',fields.seat]].filter(([k,v])=>safe(v));
 if(!values.length)return;
 const cw=w/values.length;
 values.forEach(([label,value],i)=>{
  const cx=x+i*cw+cw/2;type(g,value,cx,y,{size,min:15,maxWidth:cw*.86,anchor:'middle',fill:ink});
  type(g,label,cx,y+size+13,{size:20,min:12,maxWidth:cw*.86,anchor:'middle',weight:500,fill:ink});
 });
}
function metadata(g,data,x,y,{width=630,ink='#fff',accent='#fff',heading=25,value=33,cols=2,step=112}={}){
 const items=[['DATE',data.date],['TIME',data.time],['VENUE',data.venue],['ADDRESS',data.venueAddress],['LEVEL',data.level]].filter(([_,v])=>safe(v));
 items.forEach(([name,val],i)=>{const c=i%cols,r=Math.floor(i/cols),cx=x+c*(width/cols),cy=y+r*step;
  type(g,name,cx,cy,{size:heading,min:13,maxWidth:width/cols-30,fill:accent});
  type(g,val,cx,cy+heading+3,{size:value,min:15,maxWidth:width/cols-22,maxLines:2,fill:ink,leading:1.12,weight:600});
 });
}
function neon(svg,d){
 rect(svg,0,0,2000,647,'url(#neon-bg)');
 photo(svg,400,0,1600,647,d.imageSrc,{tint:'#260047',opacity:.55});
 rect(svg,400,0,1600,647,'#24003b',{opacity:.54});
 rect(svg,0,0,400,647,'#f875c4');
 for(let j=0;j<3;j++){circle(svg,400,j*323.5,78,'#faf8f5');}
 line(svg,400,0,400,647,'#fff',8,{'stroke-dasharray':'64 22'});
 barcode(svg,165,97,112,472,'#19051c','horizontal');
 type(svg,'ADMIT ONE',122,549,{size:78,maxWidth:480,rotate:-90,fill:'#180b19',weight:900});
 type(svg,'ADMIT: '+fallback(d.admit,d.recipient),339,577,{size:28,min:19,maxWidth:515,rotate:-90,fill:'#190b19',weight:550});
 type(svg,d.eventTitle,467,62,{size:136,min:64,maxWidth:950,maxLines:2,weight:900,fill:'#ff78c5',leading:.92});
 type(svg,d.subtitle,469,341,{size:33,min:18,maxWidth:805,weight:500,fill:'#fff'});
 type(svg,'ADMIT',1250,284,{size:37,min:22,maxWidth:340,fill:'#f9c1e0',weight:600});
 type(svg,fallback(d.admit,d.recipient),1250,323,{size:69,min:35,maxWidth:310,maxLines:2,fill:'#fff',weight:800});
 seat(svg,d,1642,308,319,'#ff91d5',45);
 type(svg,d.time,468,494,{size:39,min:22,maxWidth:210,weight:750,fill:'#fff'});
 type(svg,d.date,468,542,{size:29,min:18,maxWidth:310,fill:'#fff',weight:400});
 line(svg,716,488,716,581,'#f4d3ed',3);
 type(svg,d.venue,761,492,{size:36,min:22,maxWidth:505,fill:'#fff',weight:750});
 type(svg,d.venueAddress,763,543,{size:27,min:16,maxWidth:500,fill:'#fff',weight:450});
 type(svg,d.officialLink?new URL(d.officialLink).hostname:'',1565,492,{size:26,min:14,maxWidth:390,maxLines:2,fill:'#ff9bd1',anchor:'middle',weight:400});
}
function editorial(svg,d){
 rect(svg,0,0,2000,647,'#070608');
 rect(svg,0,0,490,647,'url(#pink-stub)');
 rect(svg,490,0,824,647,'#030304');
 photo(svg,1314,0,686,647,d.imageSrc,{tint:'#eb86b0'});
 rect(svg,1314,0,686,647,'#f8bfdc',{opacity:.15});
 line(svg,491,0,491,647,'#fff',6,{'stroke-dasharray':'6 12'});
 barcode(svg,366,118,58,421,'#111','vertical');
 type(svg,'ADMIT '+fallback(d.admit,d.recipient),79,580,{size:26,maxWidth:530,rotate:-90,weight:600,fill:'#170e15'});
 type(svg,'GATE',236,130,{size:20,maxWidth:125,fill:'#190c14'});
 type(svg,d.gate||d.section,236,162,{size:48,maxWidth:140,fill:'#190c14',weight:600});
 type(svg,'ROW',236,318,{size:20,maxWidth:130,fill:'#190c14'});
 type(svg,d.row,236,353,{size:49,maxWidth:130,fill:'#190c14',weight:600});
 type(svg,'SEAT',236,495,{size:20,maxWidth:130,fill:'#190c14'});
 type(svg,d.seat,236,527,{size:49,maxWidth:130,fill:'#190c14',weight:600});
 type(svg,'WELCOME',531,71,{size:25,maxWidth:340,fill:'#fff',weight:450,spacing:1});
 type(svg,d.eventTitle,529,103,{size:73,min:40,maxWidth:740,maxLines:2,weight:900,fill:'#ff9fc6',leading:.99});
 type(svg,d.eventTitle,532,277,{size:55,min:31,maxWidth:740,maxLines:1,fill:'#030304',stroke:'#f0a5c5',strokeWidth:2,weight:900});
 type(svg,d.subtitle,533,357,{size:27,min:16,maxWidth:740,fill:'#fff',weight:500});
 type(svg,d.date,536,453,{size:39,min:22,maxWidth:475,fill:'#ffb9d3',weight:650});
 type(svg,d.time,536,501,{size:29,min:20,maxWidth:450,fill:'#fff'});
 type(svg,d.venue,536,549,{size:29,min:20,maxWidth:480,fill:'#fff',weight:700});
 type(svg,d.venueAddress,536,586,{size:24,min:17,maxWidth:475,fill:'#fff'});
 type(svg,'ADMIT',1050,390,{size:42,min:22,maxWidth:240,fill:'#fff',weight:600});
 type(svg,fallback(d.admit,d.recipient),1050,438,{size:45,min:26,maxWidth:230,maxLines:2,fill:'#fff',weight:700});
}
function promo(svg,d){
 rect(svg,0,0,2000,647,'url(#lavender-bg)');
 bokeh(svg);
 rect(svg,0,0,410,647,'#efbbf5',{opacity:.29});
 line(svg,410,0,410,647,'#fff',8,{'stroke-dasharray':'4 13'});
 for(const y of [0,647])circle(svg,411,y,83,'#fff');
 type(svg,'MUSIC',85,64,{size:65,min:30,maxWidth:275,fill:'#361059',family:'Georgia,serif',weight:400});
 type(svg,'CONCERT',85,128,{size:65,min:30,maxWidth:280,fill:'#361059',family:'Georgia,serif',weight:400});
 rect(svg,60,184,300,78,'#431072');
 type(svg,'ADMIT ONE',84,195,{size:46,min:22,maxWidth:250,fill:'#fff',weight:800});
 seat(svg,d,65,303,305,'#48116b',45);
 barcode(svg,63,397,300,121,'#451066','vertical');
 type(svg,d.date,470,40,{size:33,min:18,maxWidth:325,fill:'#331051',weight:750});
 type(svg,d.time,470,85,{size:30,min:18,maxWidth:300,fill:'#331051',weight:700});
 photo(svg,489,138,200,268,d.imageSrc);
 rect(svg,488,137,202,270,'none',{stroke:'#fff','stroke-width':4});
 type(svg,d.venueAddress||d.venue,467,500,{size:27,min:16,maxWidth:500,fill:'#381659',weight:700});
 type(svg,d.eventTitle,836,51,{size:117,min:53,maxWidth:1060,maxLines:2,leading:1.01,fill:'#42115b',family:'Georgia,serif',weight:400});
 type(svg,'ADMIT',994,341,{size:39,min:25,maxWidth:350,fill:'#1c0a29',weight:700});
 type(svg,fallback(d.admit,d.recipient),1136,340,{size:50,min:28,maxWidth:660,maxLines:2,fill:'#23092d',weight:700});
 type(svg,d.subtitle,835,458,{size:30,min:20,maxWidth:1000,fill:'#42155b',weight:550});
 type(svg,d.officialLink?new URL(d.officialLink).hostname:'',1190,545,{size:30,min:18,maxWidth:620,fill:'#441960',anchor:'middle',weight:700});
}
function premium(svg,d){
 rect(svg,0,0,1554,647,'url(#navy-bg)');
 rect(svg,1554,0,446,647,'#fbfbfc');
 rect(svg,0,0,118,647,'#102851');
 photo(svg,139,58,478,560,d.imageSrc);
 for(let i=0;i<7;i++)for(let j=0;j<4;j++)circle(svg,123+i*15,16+j*15,2,'#cee2ff',{opacity:.55});
 type(svg,'SECTION',60,515,{size:28,maxWidth:230,rotate:-90,fill:'#f8f9ff'});
 type(svg,d.section||d.level,92,515,{size:27,maxWidth:230,rotate:-90,fill:'#f8f9ff'});
 type(svg,'ROW',61,209,{size:27,maxWidth:160,rotate:-90,fill:'#f8f9ff'});
 type(svg,d.row,93,212,{size:28,maxWidth:160,rotate:-90,fill:'#f8f9ff'});
 type(svg,d.eventTitle,672,77,{size:82,min:42,maxWidth:785,maxLines:2,fill:'#fff',weight:850,spacing:1});
 type(svg,d.subtitle,682,222,{size:29,min:19,maxWidth:730,fill:'#f3f9ff',weight:550});
 type(svg,d.date,705,337,{size:41,min:25,maxWidth:370,fill:'#fff',weight:750});
 type(svg,d.time,1110,340,{size:33,min:22,maxWidth:288,fill:'#fff',weight:650});
 type(svg,d.venue,681,415,{size:33,min:21,maxWidth:725,fill:'#fff',weight:750});
 type(svg,d.venueAddress,681,465,{size:26,min:16,maxWidth:730,fill:'#d8e4f4'});
 type(svg,'ADMIT ONE',937,526,{size:27,maxWidth:300,fill:'#fff',anchor:'middle',weight:750});
 type(svg,fallback(d.admit,d.recipient),937,566,{size:31,min:20,maxWidth:440,fill:'#fff',anchor:'middle'});
 line(svg,1554,0,1554,647,'#fff',3);
 type(svg,'ROW',1620,501,{size:29,maxWidth:210,rotate:-90,fill:'#101829',weight:750});
 type(svg,d.row,1654,501,{size:25,maxWidth:210,rotate:-90,fill:'#101829'});
 type(svg,'SECTION',1710,500,{size:29,maxWidth:255,rotate:-90,fill:'#101829',weight:750});
 type(svg,d.section||d.level,1744,498,{size:25,maxWidth:255,rotate:-90,fill:'#101829'});
 barcode(svg,1783,95,157,453,'#101010','vertical');
}
function rock(svg,d){
 rect(svg,0,0,2000,647,'#080808');
 photo(svg,0,0,948,647,d.imageSrc);
 rect(svg,948,0,606,647,'#050506');
 rect(svg,1554,0,446,647,'#060607');
 line(svg,1554,0,1554,647,'#f6f6f6',7,{'stroke-dasharray':'20 17'});
 circle(svg,1554,0,55,'#fff');circle(svg,1554,647,55,'#fff');
 type(svg,d.eventTitle,967,65,{size:91,min:39,maxWidth:545,maxLines:2,fill:'#fff',family:'Georgia,serif',weight:800});
 type(svg,d.subtitle,973,250,{size:26,min:16,maxWidth:520,fill:'#fff',weight:450});
 rect(svg,974,314,250,61,'none',{stroke:'#fff','stroke-width':2,rx:28});
 rect(svg,1250,314,254,61,'none',{stroke:'#fff','stroke-width':2,rx:28});
 type(svg,d.time,1002,324,{size:33,min:20,maxWidth:202,fill:'#fff',weight:500,family:'Georgia,serif'});
 type(svg,d.date,1276,324,{size:30,min:19,maxWidth:205,fill:'#fff',weight:500,family:'Georgia,serif'});
 type(svg,'ADMIT',968,429,{size:32,min:22,maxWidth:150,fill:'#fff',weight:500});
 type(svg,fallback(d.admit,d.recipient),1092,419,{size:37,min:22,maxWidth:420,maxLines:2,fill:'#fff',weight:500,family:'Georgia,serif'});
 type(svg,d.venue,969,510,{size:33,min:20,maxWidth:520,maxLines:2,fill:'#fff',weight:650});
 type(svg,d.venueAddress,969,572,{size:25,min:17,maxWidth:520,maxLines:2,fill:'#fff',weight:450});
 type(svg,'SECTION',1657,86,{size:25,maxWidth:200,rotate:90,fill:'#fff',weight:500});
 type(svg,d.section||d.level,1661,220,{size:25,maxWidth:220,rotate:90,fill:'#fff'});
 type(svg,'ROW',1657,306,{size:25,maxWidth:150,rotate:90,fill:'#fff',weight:500});
 type(svg,d.row,1661,422,{size:25,maxWidth:200,rotate:90,fill:'#fff'});
 type(svg,'SEAT',1657,498,{size:25,maxWidth:150,rotate:90,fill:'#fff',weight:500});
 type(svg,d.seat,1661,592,{size:25,maxWidth:170,rotate:90,fill:'#fff'});
 barcode(svg,1737,78,170,465,'#fff','vertical');
}
const renderers={'neon-tour':neon,'editorial-concert':editorial,'promo-poster':promo,'premium-headliner':premium,'rock-split':rock};
const legacy={'side-perforations':'neon-tour','stamp-edge':'editorial-concert','rounded-stub':'promo-poster','classic-notches':'rock-split'};
/** Re-render only a paid/review/creator ticket; does not create a reveal API. */
export function renderConcertReference(root,raw){
 if(!root)return;
 const data={...raw};
 data.preset=renderers[data.preset]?data.preset:(legacy[data.preset]||'premium-headliner');
 data.eventTitle=safe(data.eventTitle)||'LIVE IN CONCERT';
 data.date=fmtDate(data.date);data.time=fmtTime(data.time);
 data.officialLink=safe(data.officialLink);
 if(data.officialLink){try{const u=new URL(data.officialLink);if(!['https:','http:'].includes(u.protocol))data.officialLink='';}catch{data.officialLink='';}}
 const target=root.classList.contains('concert-ticket')?root.querySelector('.ticket-underlay'):root;
 if(!target)return;
 target.querySelector(':scope > .ct-reference-art')?.remove();
 const svg=el('svg',{class:'ct-reference-art',viewBox:'0 0 '+W+' '+H,preserveAspectRatio:'xMidYMid meet',role:'img','aria-label':'Concert ticket: '+data.eventTitle,'data-event-title':data.eventTitle,'data-reference-preset':data.preset});
 defs(svg);
 renderers[data.preset](svg,data);
 // Preserve a REAL booking QR in QR mode; decorative barcodes never encode
 // a ticket number. For paid recipients QR stays covered until 70% scratched.
 const qr=root.querySelector('#concertLiveQr:not([hidden]) svg, #ownerConcertQr:not([hidden]) svg, #concertQrRow:not([hidden]) svg');
 if(qr){
  const spots={'neon-tour':[286,524,92],'editorial-concert':[352,540,98],
   'promo-poster':[278,527,108],'premium-headliner':[1812,545,94],
   'rock-split':[1772,546,96]};
  const [x,y,size]=spots[data.preset];
  rect(svg,x-5,y-5,size+10,size+10,'#fff',{rx:4});
  const holder=el('svg',{class:'ct-reference-qr',x,y,width:size,height:size,viewBox:'0 0 100 100'},svg);
  const copy=qr.cloneNode(true);
  copy.removeAttribute('style');
  copy.setAttribute('x','0');copy.setAttribute('y','0');
  copy.setAttribute('width','100');copy.setAttribute('height','100');
  holder.append(copy);
  if(root.classList.contains('concert-ticket'))holder.style.visibility='hidden';
 }
 target.append(svg);
 root.dataset.referenceLayout=data.preset;
}
