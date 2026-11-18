import {APPROVED_POST_TEMPLATES} from './approved-post-scratch-catalogue.js?v=layout-flow-1';
/* Fixed 900 x 1200 design coordinates (export 1800 x 2400).
 * Layout geometry is authored per design from the approved references.
 * No user data is embedded in the artwork. All ten values are editable.
 * RSVP/contact, dress code and guest/admission fields remain retired. */
const serif='Georgia, "Times New Roman", serif';
const sans='Arial, Helvetica, sans-serif';
const bold='"Arial Black", Arial, Helvetica, sans-serif';
const script='"Apple Chancery", "Segoe Script", Georgia, serif';
const configs={
 'travel-collage':{ink:'#182e50',accent:'#c69338',border:'#182e50',icon:'#182e50',paper:'#fff4dd',dark:'#182e50',title:'#fff5dc',family:sans,heading:serif,outline:3,round:15},
 candlelight:{ink:'#fff1d8',accent:'#e7b76b',paper:'#281c15',dark:'#1d130e',title:'#f5d4a4',family:serif,heading:serif,outline:2,round:15},
 'paper-journey':{ink:'#503317',accent:'#95683b',paper:'#fff4de',dark:'#68401c',title:'#4a2a17',family:serif,heading:serif,outline:2,round:13},
 'sport-strike':{ink:'#064d2b',accent:'#d6fb44',paper:'#fffde8',dark:'#005b36',title:'#074a28',family:bold,heading:bold,outline:4,round:12},
 watercolour:{ink:'#8f2937',accent:'#cb9a32',icon:'#8f2937',paper:'#fff0ee',dark:'#9e3445',title:'#922c40',family:serif,heading:script,outline:2,round:11},
 spotlight:{ink:'#4a0a09',accent:'#f3cb6b',paper:'#ffedbd',dark:'#620e0d',title:'#fff0ba',family:serif,heading:serif,outline:3,round:15},
 'red-botanical':{ink:'#970f1e',accent:'#b4202b',paper:'#fbf0df',dark:'#a20f20',title:'#a40d1c',family:serif,heading:serif,outline:2,round:13},
 'pop-panels':{ink:'#111111',accent:'#161616',paper:'#fff9e8',dark:'#ff79ba',title:'#111111',family:bold,heading:bold,outline:4,round:13},
 editorial:{ink:'#20211f',accent:'#403d36',paper:'#f0eee5',dark:'#242522',title:'#222222',family:sans,heading:serif,outline:2,round:0},
 neon:{ink:'#faf1ff',accent:'#f59de8',paper:'#2a1746',dark:'#401a59',title:'#ffffff',family:sans,heading:bold,outline:3,round:16},
 'blue-ink':{ink:'#153c91',accent:'#294da0',paper:'#fffdf5',dark:'#163980',title:'#183c89',family:serif,heading:script,outline:2,round:8},
 'retro-grid':{ink:'#3b281d',accent:'#ba744e',paper:'#fff3d7',dark:'#c96644',title:'#3b281d',family:sans,heading:bold,outline:3,round:5},
 handwritten:{ink:'#12377c',accent:'#3454a1',paper:'#fffdf8',dark:'#143677',title:'#12377c',family:script,heading:script,outline:2,round:12},
 'doodle-party':{ink:'#171717',accent:'#e95331',paper:'#fffdf6',dark:'#f7b74b',title:'#151515',family:sans,heading:bold,outline:3,round:13}
};
const names={
  "candlelight": {
    "name": "Candlelight",
    "source": "Black and Beige Modern Birthday Invitation Document.jpg",
    "description": "Dark photographic backdrop, star accents and centred ivory type."
  },
  "editorial": {
    "name": "Gallery Editorial",
    "source": "Black and Grey Modern Valentine's Day Dinner Invitation.png",
    "description": "Cream editorial sheet, black typography, framed photo and starburst."
  },
  "neon": {
    "name": "Neon Celebration",
    "source": "Black and White Neon Birthday Party Poster.png",
    "description": "Electric party ornaments, dark teal and glowing script lettering."
  },
  "travel-collage": {
    "name": "Travel Collage",
    "source": "Blue & Yellow Scrapbook Travel Background Poster.png",
    "description": "Textured collage, map details, camera and luggage decoration."
  },
  "blue-ink": {
    "name": "Blue Ink",
    "source": "Blue and White Illustrated Wine Party Invitation Document.jpg",
    "description": "Cream paper, delicate blue border, large central photograph and hand-drawn still-life illustrations."
  },
  "paper-journey": {
    "name": "Paper Journey",
    "source": "Brown and Beige Illustrated Travel Scrapbook Poster.png",
    "description": "Warm scrapbook paper, torn edges, illustrated travel ephemera."
  },
  "sport-strike": {
    "name": "Sport Strike",
    "source": "Green and Yellow Modern Sport Festival Poster.png",
    "description": "Bold green and lime geometry, athletic typography and central photo."
  },
  "pop-panels": {
    "name": "Pop Panels",
    "source": "Pink and Green Simple Holi Party Invitation Poster.png",
    "description": "Graphic comic grid, pink and green panels, bold black lettering."
  },
  "watercolour": {
    "name": "Watercolour Floral",
    "source": "Pink And White Watercolor Floral Bridal Shower Elegant Invitation (1).png",
    "description": "Pink watercolor floral corners, gold double frame and script type."
  },
  "retro-grid": {
    "name": "Retro Grid",
    "source": "Please join  Birhtday Party invitation.jpg",
    "description": "Colour-blocked retro panels, party illustrations and chunky typography."
  },
  "spotlight": {
    "name": "Spotlight",
    "source": "Red And Yellow Modern Elegant Spotlight Night Poster.png",
    "description": "Red velvet curtains, theatrical lights and luminous lettering."
  },
  "red-botanical": {
    "name": "Red Botanical",
    "source": "Red Beige Vintage Elegant Dinner Party Invitation.png",
    "description": "Vintage red botanical engraving with an arched cream frame."
  },
  "handwritten": {
    "name": "Handwritten Doodles",
    "source": "Red Illustrated Birthday Invitation.png",
    "description": "Textured paper, red party doodles and playful blue handwritten type."
  },
  "doodle-party": {
    "name": "Doodle Party",
    "source": "Red White Black Hand Drawn Illustrated Music Party Invitation Flyer.png",
    "description": "Scalloped red outline, black hand-drawn party illustrations and playful typography."
  }
};
const labels={eventName:'',subtitle:'',recipient:'For You',date:'DATE',time:'TIME',venue:'VENUE / DESTINATION',venueAddress:'ADDRESS / LOCATION',sender:'From Me',message:'PERSONAL MESSAGE',link:'EVENT LINK'};
function build(id,fn){
 const c=configs[id],zones=[],panels=[],decor=[];
 let photo;
 function rect(x,y,w,h,fill,stroke='none',sw=0,rx=0){decor.push({kind:'rect',x,y,w,h,fill,stroke,sw,rx});}
 function path(d,fill,stroke='none',sw=0){decor.push({kind:'path',d,fill,stroke,sw});}
 function line(x1,y1,x2,y2,stroke=c.accent,sw=2,dash){decor.push({kind:'line',x1,y1,x2,y2,stroke,sw,dash});}
 function title(key,x,y,w,h,opts={}){
  zones.push({key,x,y,w,h,size:opts.size||64,family:opts.family||c.heading,weight:opts.weight||700,ink:opts.ink||c.title,align:opts.align||'center',upper:opts.upper??false,italic:opts.italic??false,noWordSplit:true,spacing:opts.spacing||0});
 }
 function field(key,x,y,w,h,opts={}){
  const label=opts.label??labels[key],icon=opts.icon??(!['message','link'].includes(key));

  const fill=opts.fill??c.paper,stroke=opts.stroke??c.border??c.accent,ink=opts.ink??c.ink,rx=opts.rx??c.round;
  const variant=opts.variant||'standard';
  const gutter=icon?Math.min(68,w*.18):0;
  const labelH=label?Math.min(27,Math.max(20,h*.33)):0;
  let box={x:x+gutter+7,y:y+labelH+1,w:w-gutter-14,h:h-labelH-4};
  let valueBox=null;
  if(variant==='paper-entry'){
   valueBox={x:x+150,y:y+7,w:w-154,h:h-14};
   box={x:valueBox.x+4,y:valueBox.y+2,w:valueBox.w-8,h:valueBox.h-4};
  }else if(variant==='comic-metric'){
   valueBox={x:x+16,y:y+h-62,w:w-32,h:50};
   box={x:valueBox.x+3,y:valueBox.y+1,w:valueBox.w-6,h:valueBox.h-2};
  }else if(variant==='comic-value'){
   valueBox={x:x+gutter+12,y:y+Math.max(32,h*.32),w:w-gutter-24,h:h-Math.max(32,h*.32)-10};
   box={x:valueBox.x+3,y:valueBox.y+1,w:valueBox.w-6,h:valueBox.h-2};
  }
  panels.push({key,x,y,w,h,fill,stroke,sw:opts.sw??c.outline,rx,ink,label,icon:icon?key:'',accent:opts.iconInk||c.icon||c.accent,gutter,labelH,align:opts.align||'left',family:opts.labelFamily||sans,iconBg:opts.iconBg||'',labelInk:opts.labelInk||ink,variant,valueBox,divider:opts.dividerInk||c.accent});
  zones.push({key,...box,size:opts.size||33,family:opts.family||c.family,weight:opts.weight||600,ink,align:opts.align||'left',upper:opts.upper??false,noWordSplit:key!=='message',italic:opts.italic??false});
 }
 function pic(x,y,w,h,opts={}){
  photo={x:x+8,y:y+8,w:w-16,h:h-16,radius:opts.radius??Math.max(0,c.round-4),frame:opts.fill||c.paper,primary:true};
  panels.push({key:'image',x,y,w,h,fill:opts.fill||c.paper,stroke:opts.stroke||c.accent,sw:opts.sw??c.outline,rx:opts.radius??c.round,ink:c.ink});
 }
 function pair(y,left='date',right='time',x=145,w=610,h=68,opts={}){
  const gap=18,a=(w-gap)/2;field(left,x,y,a,h,opts);field(right,x+a+gap,y,a,h,opts);
 }
 function row(key,y,x=145,w=610,h=68,opts={}){field(key,x,y,w,h,opts);}
 function message(y,x=145,w=610,h=120,opts={}){field('message',x,y,w,h,{icon:false,size:34,align:'center',...opts});}
 function link(y,x=250,w=400,h=52,opts={}){field('link',x,y,w,h,{label:'',icon:false,size:25,align:'center',fill:c.dark,ink:'#fff5df',...opts});}
 fn({c,rect,path,line,title,field,pic,pair,row,message,link});
 if(!photo)throw Error('Missing photo zone '+id);
 return {id,...names[id],image:'/post-scratch-artwork/'+id+'.webp',photo,zones,panels,decor,structured:true};
}
export const POST_TEMPLATES=[
 build('candlelight',({c,rect,line,title,field,pic,pair,message,link})=>{
  // Reference: stars at the top, gold separators, six stacked detail rows,
  // tall portrait art to the right, full-width message beneath.
  rect(57,169,786,1004,'#21150f','none',0,16);
  line(230,194,670,194);line(230,345,670,345);
  title('eventName',82,209,736,82,{size:65,upper:true});
  title('subtitle',95,291,710,51,{size:34,italic:true,weight:400});
  ['date','time','venue','venueAddress','sender','recipient'].forEach((k,i)=>field(k,65,393+i*70,445,61,{size:30,italic:true}));
  pic(532,393,303,411,{fill:'#3b2d22'});
  message(843,65,770,160,{size:34,italic:true});
  link(1030,235,430,64,{fill:'#302119',ink:'#f8d8a3'});
 }),
 build('editorial',({c,rect,line,title,field,pic,pair,row,message,link})=>{
  rect(67,55,766,1090,'#f5f2e8','#34352e',2);
  title('eventName',92,85,716,135,{size:75,weight:600});
  title('subtitle',100,224,700,50,{size:34,weight:400});
  pic(100,294,700,350,{radius:0,fill:'#e1ded5'});
  pair(671,'date','time',100,700,65,{size:31});
  row('venue',749,100,700,58);row('venueAddress',819,100,700,58);
  pair(889,'sender','recipient',100,700,65,{size:30});
  message(969,100,700,108,{size:30});
  link(1089,230,440,43,{fill:'#262722',ink:'#f5eee0'});
 }),
 build('neon',({c,rect,line,title,pic,pair,row,message,link})=>{
  rect(74,74,752,1050,'#241137','#f488e7',4,25);
  title('eventName',110,100,680,130,{size:79,upper:true});
  title('subtitle',110,235,680,58,{size:36,ink:'#eac2ff'});
  pic(125,310,650,290,{fill:'#41225b',radius:16});
  pair(618,'date','time',125,650,70);row('venue',700,125,650,62);
  row('venueAddress',774,125,650,66);pair(852,'sender','recipient',125,650,68);
  message(932,125,650,125);link(1070,225,450,43,{fill:'#ae397d'});
 }),
 build('travel-collage',({c,rect,path,line,title,pic,pair,row,message,link})=>{
  // Original travel plaque and ribbon, two date/time cells, separate venue/
  // address, paired names, large landscape photo and message.
  rect(130,68,640,1080,'#f7f1e5','none',0,26);
  path('M205 83 Q205 76 245 76 H391 Q391 40 450 40 Q509 40 509 76 H655 Q695 76 695 109 Q743 120 743 167 Q743 208 698 225 H202 Q157 208 157 167 Q157 120 205 109 Z','#182b4a','#c69338',5);
  path('M437 66 Q450 48 463 66 Q469 77 450 100 Q431 77 437 66 Z','#fff0d9');
  title('eventName',205,108,490,105,{size:60,upper:true});
  path('M221 237 H679 L657 272 L679 308 H221 L243 272 Z','#fff4dd','#182e50',3);
  title('subtitle',258,241,384,63,{size:33,ink:c.ink,upper:true});
  pair(344,'date','time',148,604,71,{size:32});
  row('venue',429,148,604,65);row('venueAddress',507,148,604,65);
  pair(585,'sender','recipient',148,604,71,{size:30});
  pic(148,672,604,200,{fill:'#e1e3e7',radius:15});
  message(887,148,604,132,{size:33});
  link(1040,222,456,64);
 }),
 build('blue-ink',({c,rect,line,title,pic,pair,row,message,link})=>{
  rect(115,95,670,1020,'#fffdf7','none',0,15);
  title('eventName',140,110,620,126,{size:75,weight:600});
  title('subtitle',150,242,600,55,{size:35,italic:true});
  pair(312,'date','time',140,620,66,{size:31});
  pic(190,395,520,330,{radius:6,fill:'#f6f5ef'});
  row('venue',741,140,620,56);row('venueAddress',807,140,620,59);
  pair(877,'sender','recipient',140,620,65,{size:30});
  message(953,140,620,108,{size:30});
  link(1073,255,390,46);
 }),
 build('paper-journey',({c,rect,line,title,field,pic,pair,message,link})=>{
  rect(100,135,700,855,'#fbefd7','none',0,8);
  rect(226,143,448,95,'#fff0d7','#85592d',3,28);
  title('eventName',244,149,412,80,{size:58});
  title('subtitle',200,257,500,57,{size:33,italic:true});
  ['date','time','venue','venueAddress'].forEach((k,i)=>field(k,111,336+i*65,454,56,{size:29,variant:'paper-entry',stroke:'#886642',iconInk:'#72502d',label:k==='venue'?'LOCATION':k==='venueAddress'?'ADDRESS':labels[k]}));
  pic(600,336,195,251,{fill:'#e9decf',stroke:'#9f784d'});
  line(110,606,795,606,'#a07d57',2,'3 5');
  pair(621,'sender','recipient',111,684,69,{size:30});
  message(708,111,684,163,{size:34});
  link(895,225,450,66,{fill:'#6d4527'});
 }),
 build('sport-strike',({c,rect,path,title,pic,pair,row,message,link})=>{
  rect(106,65,688,1080,'#08763c','none',0,6);
  path('M146 96 H808 L759 195 H101 Z','#dfff47');
  title('eventName',153,103,594,83,{size:68,upper:true});
  path('M267 205 H650 L630 249 H247 Z','#005737','#dcf94b',3);
  title('subtitle',266,206,368,42,{size:29,upper:true,ink:'#fffde8'});
  pic(127,265,646,280,{fill:'#06472b',stroke:'#b9ec48',sw:5});
  pair(573,'date','time',124,652,64,{size:31,iconBg:'#00723c',iconInk:'#efffd7'});
  row('venue',648,124,652,63,{iconBg:'#00723c',iconInk:'#efffd7'});
  row('venueAddress',721,124,652,63,{iconBg:'#00723c',iconInk:'#efffd7'});
  pair(794,'sender','recipient',124,652,72,{size:30,iconBg:'#00723c',iconInk:'#efffd7'});
  message(885,98,704,180,{size:34});
  link(1082,124,652,62,{fill:'#ddff46',ink:'#064d2b'});
 }),
 build('pop-panels',({c,rect,path,title,field,pic,pair,message,link})=>{
  // Graphic comic grid: illustrations stay on the left/top, title and
  // subtitle in colour blocks, date/time as adjacent large panels.
  rect(16,16,868,1168,'#fff9ea','#101010',5,0);
  rect(28,27,218,170,'#19cb91','#111',4);
  // Simple editable disco-ball motif (not a baked caption).
  decorDisco(path);
  rect(260,27,612,170,'#ff8ac9','#111',4);
  rect(281,52,570,116,'#fff9e8','#111',4,22);
  title('eventName',294,64,544,94,{size:64,upper:true});
  rect(28,210,260,282,'#fff7e8','#111',4);
  rect(301,210,571,105,'#55e6b4','#111',4);
  rect(325,228,523,68,'#fff9e8','#111',3,18);
  title('subtitle',331,233,511,58,{size:37,upper:true,ink:'#111'});
  field('date',301,328,279,164,{size:37,fill:'#ff89bc',align:'center',variant:'comic-metric'});
  field('time',593,328,279,164,{size:37,fill:'#ff797b',align:'center',variant:'comic-metric'});
  field('venue',28,505,420,102,{size:33,fill:'#d5f776',variant:'comic-value',align:'center',label:'VENUE'});
  field('venueAddress',461,505,411,102,{size:31,fill:'#d5f776',variant:'comic-value',align:'center',label:'ADDRESS'});
  pic(28,620,314,285,{fill:'#8bd6ef',radius:2});
  field('sender',355,620,517,136,{size:37,fill:'#ff93ca',variant:'comic-value',align:'center'});
  field('recipient',355,769,517,136,{size:37,fill:'#55e6b4',variant:'comic-value',align:'center'});
  message(918,28,844,166,{size:36,fill:'#ff797b',variant:'comic-value'});
  link(1096,28,570,73,{fill:'#ff9ace',ink:'#111'});
  rect(611,1096,261,73,'#1bd597','#111',4);
  path('M741 1105 L753 1127 L777 1133 L753 1140 L741 1160 L729 1140 L705 1133 L729 1127 Z','#f9e846','#111',3);
 }),
 build('watercolour',({c,rect,line,title,field,pic,pair,row,message,link})=>{
  rect(107,98,686,1010,'#fffaf8','#c99b32',3);
  rect(117,108,666,990,'none','#e9c653',1);
  title('eventName',160,174,580,128,{size:70,weight:500});
  rect(182,320,536,77,'#fbdcde','#c99b32',2,16);
  title('recipient',190,324,520,69,{family:serif,size:44,italic:true,weight:400});
  title('subtitle',166,408,568,60,{family:serif,size:33,italic:true,weight:400});
  pair(490,'date','time',143,614,65,{size:29});
  row('venue',568,143,614,67);row('venueAddress',648,143,614,68);
  row('sender',729,143,614,61,{size:30});
  pic(143,805,260,190,{fill:'#f9e7e7',radius:9});
  message(805,418,339,190,{size:30});
  link(1010,240,420,58,{fill:'#f9e2e2',ink:'#922c40'});
 }),
 build('retro-grid',({c,rect,line,title,field,pic,pair,row,message,link})=>{
  rect(72,86,756,1026,'#f8ebcf','#a8663e',3,4);
  rect(94,109,712,151,'#e7b277','#a8663e',3,5);
  title('eventName',110,119,680,130,{size:70,upper:true});
  title('subtitle',110,271,680,54,{size:34,ink:c.ink});
  pic(96,340,278,378,{fill:'#e7d7b6'});
  ['date','time','venue','venueAddress','sender','recipient'].forEach((k,i)=>field(k,389,340+i*65,415,55,{size:30,stroke:'#ad805e'}));
  message(743,96,708,190,{size:36});
  link(955,230,440,60,{fill:'#ad6845'});
 }),
 build('spotlight',({c,rect,path,line,title,field,pic,pair,message,link})=>{
  // Theatre curtain and stage artwork remain visible around the plaque and
  // gold-framed image, exactly the left-image/right-information arrangement.
  path('M173 120 H727 Q727 149 754 149 V222 Q727 222 727 250 H173 Q173 222 146 222 V149 Q173 149 173 120 Z','#530909','#efc167',5);
  title('eventName',177,130,546,107,{size:67,upper:true});
  rect(244,255,412,56,'#ffe7a6','#cf9235',3,11);
  title('subtitle',255,257,390,51,{size:35,upper:true,ink:c.ink});
  pic(115,333,273,318,{fill:'#550d09',stroke:'#ffd579',sw:5});
  ['date','time','venue','venueAddress'].forEach((k,i)=>field(k,415,337+i*80,369,67,{size:30,iconBg:'#5b0b0c',iconInk:'#f5cf74'}));
  pair(677,'sender','recipient',111,678,74,{size:32});
  message(771,111,678,173,{size:36,stroke:'#e9b44e'});
  link(1019,180,540,62,{fill:'#5b0b0c',ink:'#fff0ba'});
 }),
 build('red-botanical',({c,rect,line,title,pic,pair,row,message,link})=>{
  rect(168,178,564,886,'#fbf0df','none',0,9);
  title('eventName',184,190,532,72,{size:56,upper:true});
  title('subtitle',220,267,460,54,{size:31,italic:true,upper:true,weight:400});
  pic(219,334,462,200,{fill:'#f5e2d8',stroke:'#a61020',sw:3});
  const open={fill:'none',stroke:'none',iconInk:'#971321'};
  pair(554,'date','time',179,542,66,{size:29,...open});
  line(181,625,719,625,'#ae2430',1.5);
  row('venue',632,179,542,61,{size:31,...open});
  row('venueAddress',704,179,542,61,{size:29,...open});
  line(181,770,719,770,'#ae2430',1.5);
  pair(776,'sender','recipient',179,542,66,{size:29,...open});
  line(181,845,719,845,'#ae2430',1.5);
  message(854,179,542,157,{size:33,italic:true});
  link(1024,226,448,51,{fill:'#f7e6e1',ink:'#a61020'});
 }),
 build('handwritten',({c,rect,line,title,pic,pair,row,message,link})=>{
  rect(130,131,640,961,'#fffdf8','none',0,10);
  title('eventName',153,150,594,133,{size:72,weight:600});
  title('subtitle',162,292,576,58,{size:36,weight:400});
  pic(169,370,562,267,{fill:'#fffdf8',stroke:'#3454a1'});
  pair(655,'date','time',151,598,65,{size:30});
  row('venue',731,151,598,59);row('venueAddress',801,151,598,62);
  pair(875,'sender','recipient',151,598,65,{size:29});
  message(950,151,598,108,{size:31});
  link(1070,255,390,49);
 }),
 build('doodle-party',({c,rect,line,title,field,pic,pair,row,message,link})=>{
  // Deliberately retain illustration art around the fields. Structured
  // comic-style panels eliminate the scattered text seen in the old editor.
  rect(95,98,710,1010,'#fffdfb','none',0,8);
  rect(100,100,700,190,'#fffdf6','#151515',3,18);
  title('eventName',110,103,680,133,{size:68,upper:true});
  title('subtitle',122,240,656,46,{size:32,ink:'#252525'});
  pic(472,321,315,300,{fill:'#fffaf0',stroke:'#161616',radius:12});
  pair(645,'date','time',105,690,70,{size:32,stroke:'#151515'});
  row('venue',728,105,690,62,{stroke:'#151515'});
  row('venueAddress',801,105,690,62,{stroke:'#151515'});
  pair(874,'sender','recipient',105,690,67,{size:29,stroke:'#151515'});
  message(953,105,690,117,{size:31,stroke:'#151515'});
  link(1081,230,440,50,{fill:'#fff4d4',ink:'#171717',stroke:'#151515'});
 }),
 {
  "id": "custom-image",
  "name": "Custom Image",
  "description": "Your own full-bleed portrait photograph or artwork, with all editable reveal details layered above it.",
  "photo": {
    "x": 0,
    "y": 0,
    "w": 900,
    "h": 1200,
    "full": true
  },
  "zones": [
    {
      "key": "eventName",
      "x": 60,
      "y": 64,
      "w": 780,
      "h": 170,
      "size": 77,
      "family": "Georgia, serif",
      "weight": 700,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "subtitle",
      "x": 65,
      "y": 242,
      "w": 770,
      "h": 78,
      "size": 38,
      "family": "Arial, sans-serif",
      "weight": 500,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "recipient",
      "x": 65,
      "y": 328,
      "w": 770,
      "h": 65,
      "size": 34,
      "family": "Arial, sans-serif",
      "weight": 600,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "date",
      "x": 65,
      "y": 582,
      "w": 375,
      "h": 75,
      "size": 38,
      "family": "Arial, sans-serif",
      "weight": 650,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "time",
      "x": 460,
      "y": 582,
      "w": 375,
      "h": 75,
      "size": 38,
      "family": "Arial, sans-serif",
      "weight": 650,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "venue",
      "x": 65,
      "y": 665,
      "w": 770,
      "h": 70,
      "size": 38,
      "family": "Arial, sans-serif",
      "weight": 650,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "venueAddress",
      "x": 65,
      "y": 743,
      "w": 770,
      "h": 64,
      "size": 32,
      "family": "Arial, sans-serif",
      "weight": 500,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "message",
      "x": 65,
      "y": 896,
      "w": 770,
      "h": 130,
      "size": 34,
      "family": "Georgia, serif",
      "weight": 400,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "senderLine",
      "x": 65,
      "y": 1034,
      "w": 770,
      "h": 54,
      "size": 30,
      "family": "Arial, sans-serif",
      "weight": 500,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    },
    {
      "key": "link",
      "x": 65,
      "y": 1096,
      "w": 770,
      "h": 48,
      "size": 27,
      "family": "Arial, sans-serif",
      "weight": 600,
      "ink": "#ffffff",
      "align": "center",
      "noWordSplit": true
    }
  ],
  "source": "Customer upload",
  "image": "/post-scratch-artwork/custom-image.webp"
}
 ,...APPROVED_POST_TEMPLATES
];
function decorDisco(path){
 path('M135 39 V61 M66 130 A68 68 0 1 0 202 130 A68 68 0 1 0 66 130 Z','#f8f4e5','#111',4);
 for(const y of [90,112,139,165])path('M78 '+y+' Q134 '+(y+10)+' 190 '+y,'none','#111',2);
 path('M134 62 V198 M134 62 Q83 130 134 198 M134 62 Q185 130 134 198','none','#111',3);
}
export const getPostTemplate=id=>POST_TEMPLATES.find(t=>t.id===id);
