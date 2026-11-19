const DARK_INK='#382923';
const PALE_GOLD='#F5E7BF';

function trackedText(ctx,text,centerX,y,fontSize,tracking,color,maxWidth){
  ctx.save();
  ctx.font=`500 ${fontSize}px "Baskerville", "Times New Roman", serif`;
  ctx.textAlign='left';
  ctx.textBaseline='middle';
  ctx.fillStyle=color;
  ctx.shadowColor=color===PALE_GOLD?'rgba(0,0,0,.34)':'rgba(255,255,255,.6)';
  ctx.shadowBlur=2;
  const widths=[...text].map(char=>ctx.measureText?ctx.measureText(char).width:fontSize*.58);
  const fullWidth=widths.reduce((sum,width)=>sum+width,0)+tracking*(text.length-1);
  const scale=Math.min(1,maxWidth/fullWidth);
  let x=centerX-fullWidth*scale/2;
  for(let i=0;i<text.length;i++){
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(scale,1);
    ctx.fillText(text[i],0,0);
    ctx.restore();
    x+=(widths[i]+tracking)*scale;
  }
  ctx.restore();
}

function drawRule(ctx,cx,y,width,color,diamondSize){
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineWidth=Math.max(.65,width*.003);
  ctx.globalAlpha=.78;
  ctx.beginPath();
  ctx.moveTo(cx-width*.43,y);ctx.lineTo(cx-width*.10,y);
  ctx.moveTo(cx+width*.10,y);ctx.lineTo(cx+width*.43,y);
  ctx.stroke();
  ctx.translate(cx,y);ctx.rotate(Math.PI/4);
  ctx.globalAlpha=.9;ctx.fillStyle=color;
  ctx.fillRect(-diamondSize/2,-diamondSize/2,diamondSize,diamondSize);
  ctx.restore();
}

/** Draw a refined editorial title on top of an adult paired scratch cover. */
export function drawScratchCoverTypography(ctx,width,height,product,coverId=''){
  if(!ctx||!product||product.id.startsWith('kids-'))return;
  const dark=['bow-emerald','wrap-emerald','wrap-sapphire'].includes(product.id);
  const color=dark?PALE_GOLD:(product.ink||DARK_INK);
  const cx=width/2;
  const centerY=height*.505;
  const scale=width/360;
  const size=(value)=>Math.max(8,value*scale);
  ctx.save();
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor=dark?'rgba(0,0,0,.42)':'rgba(255,255,255,.7)';
  ctx.shadowBlur=size(4);ctx.shadowOffsetY=size(1);

  const envelope=product.collection==='Gift envelopes';
  const wrap=product.collection==='Gift boxes without bows';
  trackedText(ctx,'SCRATCH  TO',cx,centerY-size(31),size(11),size(2.2),color,width*.76);
  drawRule(ctx,cx,centerY-size(16),width*.42,color,size(3.4));

  if(envelope&&!coverId.endsWith('-alternative')){
    ctx.save();
    ctx.font=`italic 500 ${size(42)}px "Baskerville", "Didot", "Times New Roman", serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;
    ctx.shadowColor=dark?'rgba(0,0,0,.5)':'rgba(255,255,255,.75)';
    ctx.shadowBlur=size(2);ctx.shadowOffsetY=size(1);
    ctx.fillText('Reveal',cx,centerY+size(5),width*.78);
    ctx.restore();
  }else if(envelope){
    trackedText(ctx,'REVEAL',cx,centerY+size(4),size(34),size(4.6),color,width*.78);
  }else{
    ctx.save();
    ctx.font=`italic 500 ${size(wrap?45:47)}px "Baskerville", "Didot", "Times New Roman", serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=color;
    ctx.shadowColor=dark?'rgba(0,0,0,.5)':'rgba(255,255,255,.75)';
    ctx.shadowBlur=size(2);ctx.shadowOffsetY=size(1);
    ctx.fillText('Reveal',cx,centerY+size(5),width*.78);
    ctx.restore();
  }
  drawRule(ctx,cx,centerY+size(36),width*.32,color,size(2.7));
  ctx.restore();
}
