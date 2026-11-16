/**
 * Four original, responsive concert-ticket silhouettes based on the owner's
 * reference sheet. Scratch foil colour and post-scratch theme are independent.
 * All geometry is normalised so the same ticket is used by the creator,
 * owner review and paid recipient.
 */
export const CONCERT_TICKET_TEMPLATES=Object.freeze([
 Object.freeze({id:'side-perforations',label:'Side perforations',description:'Perforated left and right ticket edges'}),
 Object.freeze({id:'stamp-edge',label:'Stamp edge',description:'Fine scallops along the top and bottom'}),
 Object.freeze({id:'classic-notches',label:'Classic notches',description:'Inward cut-outs on all four corners'}),
 Object.freeze({id:'rounded-stub',label:'Rounded stub',description:'Rounded ticket with a detachable end'})
]);
export const CONCERT_REVEAL_THEMES=Object.freeze([
 Object.freeze({id:'classic',label:'Classic',description:'Elegant cream and gold ticket'}),
 Object.freeze({id:'concert-lights',label:'Concert Lights',description:'Stage lighting and live music'}),
 Object.freeze({id:'festival',label:'Festival',description:'Sunset festival atmosphere'}),
 Object.freeze({id:'backstage',label:'Backstage',description:'VIP backstage styling'})
]);
export const DEFAULT_CONCERT_TEMPLATE='classic-notches';
export const DEFAULT_CONCERT_REVEAL_THEME='classic';
const templateIds=new Set(CONCERT_TICKET_TEMPLATES.map(x=>x.id));
const revealIds=new Set(CONCERT_REVEAL_THEMES.map(x=>x.id));
export const isConcertTemplate=id=>templateIds.has(id);
export const isConcertRevealTheme=id=>revealIds.has(id);
const clamp=n=>Math.max(0,Math.min(1,n));
const pt=(out,x,y)=>out.push([clamp(x),clamp(y)]);

// Normalised polygon along a ticket's exterior, clockwise.
export function concertTicketPolygon(id=DEFAULT_CONCERT_TEMPLATE){
 const t=isConcertTemplate(id)?id:DEFAULT_CONCERT_TEMPLATE,p=[];
 if(t==='side-perforations'){
  pt(p,0,0);pt(p,1,0);
  for(const y of [.13,.27,.41,.55,.69,.83]){
   pt(p,1,y-.043);
   for(let i=0;i<=10;i++){
    const a=-Math.PI/2+i*Math.PI/10;
    pt(p,1-.020*Math.cos(a),y+.043*Math.sin(a));
   }
  }
  pt(p,1,1);pt(p,0,1);
  for(const y of [.83,.69,.55,.41,.27,.13]){
   pt(p,0,y+.043);
   for(let i=0;i<=10;i++){
    const a=Math.PI/2+i*Math.PI/10;
    pt(p,-.020*Math.cos(a),y+.043*Math.sin(a));
   }
  }
 }else if(t==='stamp-edge'){
  pt(p,0,0);
  for(let k=0;k<18;k++){
   const x=(k+.5)/18,r=.023;
   pt(p,x-r,0);
   for(let i=0;i<=8;i++){
    const v=i/8;pt(p,x-r+2*r*v,.038*Math.sin(Math.PI*v));
   }
  }
  pt(p,1,0);pt(p,1,.40);
  for(let i=0;i<=12;i++){const a=-Math.PI/2+i*Math.PI/12;pt(p,1-.055*Math.cos(a),.50+.10*Math.sin(a));}
  pt(p,1,1);
  for(let k=17;k>=0;k--){
   const x=(k+.5)/18,r=.023;
   pt(p,x+r,1);
   for(let i=0;i<=8;i++){
    const v=i/8;pt(p,x+r-2*r*v,1-.038*Math.sin(Math.PI*v));
   }
  }
  pt(p,0,1);pt(p,0,.60);
  for(let i=0;i<=12;i++){const a=Math.PI/2+i*Math.PI/12;pt(p,.055*Math.cos(a),.50+.10*Math.sin(a));}
 }else if(t==='rounded-stub'){
  pt(p,.045,0);pt(p,.63,0);pt(p,.645,.022);pt(p,.71,.022);
  pt(p,.725,0);pt(p,.955,0);
  for(let i=0;i<=8;i++){const a=-Math.PI/2+i*Math.PI/16;pt(p,.955+.045*Math.cos(a),.08+.08*Math.sin(a));}
  pt(p,1,.84);
  for(let i=0;i<=8;i++){const a=i*Math.PI/16;pt(p,.955+.045*Math.cos(a),.92+.08*Math.sin(a));}
  pt(p,.725,1);pt(p,.71,.975);pt(p,.645,.975);pt(p,.63,1);pt(p,.045,1);
  for(let i=0;i<=8;i++){const a=Math.PI/2+i*Math.PI/16;pt(p,.045+.045*Math.cos(a),.92+.08*Math.sin(a));}
  pt(p,0,.16);
  for(let i=0;i<=8;i++){const a=Math.PI+i*Math.PI/16;pt(p,.045+.045*Math.cos(a),.08+.08*Math.sin(a));}
 }else{
  // Corner-notch admission ticket (third design in reference)
  pt(p,.040,0);pt(p,.960,0);
  for(let i=0;i<=9;i++){const a=-Math.PI/2+i*Math.PI/18;pt(p,.960+.040*Math.cos(a),.11+.11*Math.sin(a));}
  pt(p,1,.89);
  for(let i=0;i<=9;i++){const a=i*Math.PI/18;pt(p,.960+.040*Math.cos(a),.89+.11*Math.sin(a));}
  pt(p,.040,1);
  for(let i=0;i<=9;i++){const a=Math.PI/2+i*Math.PI/18;pt(p,.040+.040*Math.cos(a),.89+.11*Math.sin(a));}
  pt(p,0,.11);
  for(let i=0;i<=9;i++){const a=Math.PI+i*Math.PI/18;pt(p,.040+.040*Math.cos(a),.11+.11*Math.sin(a));}
 }
 return p;
}
export function concertTicketClipPath(id){
 return 'polygon('+concertTicketPolygon(id).map(([x,y])=>(x*100).toFixed(3)+'% '+(y*100).toFixed(3)+'%').join(',')+')';
}
export function drawConcertTicketPath(ctx,w,h,id){
 const p=concertTicketPolygon(id);
 ctx.beginPath();
 p.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));
 ctx.closePath();
}
export function applyConcertTicketShape(element,id){
 if(element)element.style.clipPath=concertTicketClipPath(id);
}
