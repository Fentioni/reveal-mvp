import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const browserName=process.env.QUEST_BROWSER==='webkit'?'webkit':'chromium';
const browserType=browserName==='webkit'?webkit:chromium;
const output=resolve(root,'test-output','quest-'+browserName);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp'};
const chapters={
 quick:[['The Mysterious Letter','letter'],['The Locked Suitcase','suitcase'],['The Missing Itinerary','ticket']],
 classic:[['The Mysterious Letter','letter'],['The Locked Suitcase','suitcase'],['The Passport Mystery','passport'],['The Secret Map','map'],['The Missing Itinerary','ticket']],
 epic:[['The Mysterious Letter','letter'],['The Compass Rose','letter'],['The Locked Suitcase','suitcase'],['The Passport Mystery','passport'],['The Secret Map','map'],['The Final Cipher','ticket'],['The Missing Itinerary','ticket']]
};

async function startServer(){
 const s=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const key=url.pathname==='/quest'?'/quest.html':url.pathname;
  if(!/^\/(quest\.html|quest\.js|quest-assets\/(letter|suitcase|passport|map|ticket|finale)\.webp)$/.test(key)){
   res.writeHead(404);res.end();return;
  }
  try{
   const content=await readFile(resolve(root,'public',key.slice(1)));
   res.writeHead(200,{'content-type':mime[extname(key)]});res.end(content);
  }catch{res.writeHead(404);res.end('Missing');}
 });
 await new Promise(done=>s.listen(0,'127.0.0.1',done));
 return {server:s,base:'http://127.0.0.1:'+s.address().port};
}
async function assertSequenceSpacing(page,name){
 const rects=await page.locator('.stage-card .order-actions').evaluate(root=>{
  const last=root.querySelector('.order-options button:last-child');
  const check=root.querySelector('.check-sequence');
  if(!last||!check)return null;
  const a=last.getBoundingClientRect(),b=check.getBoundingClientRect();
  return {gap:b.top-a.bottom,optionsEnd:root.querySelector('.order-options').getBoundingClientRect().bottom,checkTop:b.top};
 });
 assert.ok(rects,name+' needs separate option and confirmation controls');
 assert.ok(rects.gap>=12,name+' final answer overlaps Check sequence: '+rects.gap);
 assert.ok(rects.checkTop>=rects.optionsEnd+12,name+' sequence overlaps answer grid');
}
async function assertLandmarkKeys(page){
 const list=await page.locator('.hero-object.map .map-pin-key').evaluateAll(nodes=>nodes.map(node=>{
  const rect=node.getBoundingClientRect(),frame=node.parentElement.getBoundingClientRect();
  return {name:node.querySelector('.map-pin-key-name')?.textContent,
    pin:Number(node.dataset.pin),x:parseFloat(node.style.left),
    inside:rect.left>=frame.left-2&&rect.right<=frame.right+2};
 }));
 assert.deepEqual(list.map(x=>x.name),['Lighthouse','Waypoint','Forest','Waypoint','Mountain peak']);
 assert.deepEqual(list.map(x=>x.pin),[1,2,3,4,5]);
 assert.ok(list.every((x,i)=>x.inside&&(i===0||list[i-1].x<x.x)),'Map landmark badges must attach to visible left-to-right pins');
 assert.match(await page.locator('.stage-card .map-help').innerText(),/two connecting waypoints/);
}
async function playChapter(page,title,sceneName,index,preset){
 await page.locator('.quest h2').filter({hasText:title}).waitFor({timeout:12000});
 assert.equal(await page.locator('.quest h2').innerText(),title);
 const hero=page.locator('.hero-object.'+sceneName);
 assert.equal(await hero.count(),1);
 assert.ok(await hero.evaluate((el,scene)=>{const layer=el.querySelector(scene==='suitcase'?'.suitcase-photo':scene==='passport'?'.passport-art':scene==='map'?'.map-source':'.hero-object')||el;return getComputedStyle(layer).backgroundImage.includes('/quest-assets/'+scene+'.webp');},sceneName),'Missing chapter artwork');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 assert.ok(overflow<=2,'Horizontal overflow '+overflow+'px in '+preset+' / '+title);
 await page.screenshot({path:resolve(output,preset+'-chapter-'+(index+1)+'.png'),animations:'disabled',fullPage:true});
 if(title==='The Mysterious Letter')await page.getByRole('button',{name:'A compass'}).click();
 if(title==='The Locked Suitcase'){
  for(const [i,num] of [[1,4],[2,2],[3,7]])
   for(let t=0;t<num;t++)await page.getByRole('button',{name:'Increase digit '+i}).click();
  await page.getByRole('button',{name:'Unlock suitcase'}).click();
 }
 if(title==='The Passport Mystery'){
  await assertSequenceSpacing(page,'Passport');
  for(const place of ['Rome · 08 Apr','Barcelona · 12 Apr','Lisbon · 19 Apr'])await page.getByRole('button',{name:place}).click();
  await page.getByRole('button',{name:'Check sequence'}).click();
 }
 if(title==='The Secret Map'){
  await assertSequenceSpacing(page,'Map');
  await assertLandmarkKeys(page);
  for(const place of ['Lighthouse','Forest','Mountain peak'])await page.getByRole('button',{name:place}).click();
  await page.getByRole('button',{name:'Check sequence'}).click();
 }
 if(title==='The Compass Rose'){
  for(const direction of ['East','South','West'])await page.getByRole('button',{name:direction}).click();
  await page.getByRole('button',{name:'Check sequence'}).click();
 }
 if(title==='The Final Cipher')await page.getByRole('button',{name:'An itinerary'}).click();
 if(title==='The Missing Itinerary'){
  for(const item of ['Route line','Flight symbol','Gold seal'])await page.getByRole('button',{name:item}).click();
  await page.getByRole('button',{name:'Check sequence'}).click();
 }
}

test('all 3/5/7 quests play end-to-end as premium portrait mobile samples', {timeout:120000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 await mkdir(output,{recursive:true});
 try{
  for(const [preset,items] of Object.entries(chapters)){
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
     deviceScaleFactor:2,reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/quest',{waitUntil:'networkidle'});
   await page.locator('#creatorForm').waitFor({timeout:10000});
   await page.locator('select[name=preset]').selectOption(preset);
   assert.equal(await page.locator('#editors .stepedit').count(),items.length);
   await page.getByRole('button',{name:'Play the sample adventure'}).click();
   await page.getByRole('button',{name:/Begin the adventure/}).click();
   for(let i=0;i<items.length;i++)await playChapter(page,...items[i],i,preset);
   await page.getByText('Your personalised surprise will appear here after payment').waitFor({timeout:12000});
   assert.ok(await page.locator('.scene.finale').count());
   await page.screenshot({path:resolve(output,preset+'-finale.png'),animations:'disabled',fullPage:true});
   await page.getByRole('button',{name:'Return to your editor'}).click();
   assert.ok(await page.locator('#creatorForm').isVisible());
   assert.deepEqual(errors,[],preset+' browser errors');
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});


test('normal-motion suitcase fully opens before the success overlay or next puzzle', {timeout:40000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,
   hasTouch:true,deviceScaleFactor:2,reducedMotion:'no-preference'});
  await page.goto(base+'/quest',{waitUntil:'networkidle'});
  await page.locator('select[name=preset]').selectOption('quick');
  await page.getByRole('button',{name:'Play the sample adventure'}).click();
  await page.getByRole('button',{name:/Begin the adventure/}).click();
  await page.getByRole('button',{name:'A compass'}).click();
  await page.locator('.quest h2').filter({hasText:'The Locked Suitcase'}).waitFor({timeout:10000});
  for(const [i,num] of [[1,4],[2,2],[3,7]])
   for(let n=0;n<num;n++)await page.getByRole('button',{name:'Increase digit '+i}).click();
  await page.getByRole('button',{name:'Unlock suitcase'}).click();
  const lid=page.locator('.quest.chapter-clear .case-lid');
  await lid.waitFor({timeout:2500});
  const durations=await lid.evaluate(el=>el.getAnimations().map(a=>a.effect?.getComputedTiming()?.endTime).filter(Number.isFinite));
  assert.ok(durations.some(ms=>ms>=2500),'The lid must have a full 2.55-second opening');
  await page.waitForTimeout(1250);
  assert.equal(await page.locator('.quest h2').innerText(),'The Locked Suitcase',
   'Keep the suitcase scene while its lid is opening');
  assert.equal(await page.locator('.success').count(),0,
   'Do not cover a partially opened suitcase with the success screen');
  await page.locator('.success .chapter-message').filter({hasText:'The suitcase is unlocked'})
   .waitFor({timeout:6000});
  assert.equal(await page.locator('.quest h2').innerText(),'The Locked Suitcase',
   'Show chapter celebration while the finished suitcase scene is still displayed');
  await page.locator('.quest h2').filter({hasText:'The Missing Itinerary'}).waitFor({timeout:6000});
  assert.equal(await page.locator('.success').count(),0);
  await page.close();
 }finally{
  await browser.close();
  await new Promise(done=>server.close(done));
 }
});


test('physical suitcase, bound passport leaf and accurate five-pin map route', {timeout:90000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage({
   viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,
   hasTouch:true,reducedMotion:'no-preference'
  });
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base+'/quest',{waitUntil:'networkidle'});
  await page.locator('select[name=preset]').selectOption('classic');
  await page.getByRole('button',{name:'Play the sample adventure'}).click();
  await page.getByRole('button',{name:/Begin the adventure/}).click();
  await page.getByRole('button',{name:'A compass'}).click();
  await page.locator('.quest h2').filter({hasText:'The Locked Suitcase'}).waitFor();
  const caseGeometry=await page.locator('.suitcase-photo').evaluate(photo=>{
   const lid=photo.querySelector('.case-lid'),interior=photo.querySelector('.case-interior');
   const a=photo.getBoundingClientRect(),b=lid.getBoundingClientRect();
   return {
    lidInsidePhoto:photo.contains(lid),interiorInsidePhoto:photo.contains(interior),
    sameExtent:Math.abs(a.left-b.left)<2 && Math.abs(a.width-b.width)<2,
    lidArtwork:getComputedStyle(lid).backgroundImage.includes('suitcase.webp'),
    lidHinge:getComputedStyle(lid).transformOrigin,
    interiorHiddenUnderLid:getComputedStyle(interior).filter.includes('brightness')
   };
  });
  assert.equal(caseGeometry.lidInsidePhoto,true);
  assert.equal(caseGeometry.interiorInsidePhoto,true);
  assert.equal(caseGeometry.sameExtent,true);
  assert.equal(caseGeometry.lidArtwork,true);
  assert.equal(caseGeometry.interiorHiddenUnderLid,true);
  assert.match(caseGeometry.lidHinge,/17%|px/);
  for(const [i,num] of [[1,4],[2,2],[3,7]]){
   for(let n=0;n<num;n++)await page.getByRole('button',{name:'Increase digit '+i}).click();
  }
  await page.getByRole('button',{name:'Unlock suitcase'}).click();
  await page.locator('.quest.chapter-clear .suitcase-photo .case-lid').waitFor();
  await page.waitForTimeout(1550);
  const opening=await page.locator('.suitcase-photo').evaluate(photo=>{
   const lid=photo.querySelector('.case-lid');
   const matrix=new DOMMatrixReadOnly(getComputedStyle(lid).transform);
   const interior=photo.querySelector('.case-interior');
   return {tilt:matrix.m22,insideBrightness:getComputedStyle(interior).filter};
  });
  assert.ok(opening.tilt<0.95,'Photographic suitcase lid must visibly pivot, not simply fade or scale');
  assert.notEqual(opening.insideBrightness,'brightness(0.5)');
  await page.screenshot({path:resolve(output,'physical-suitcase-opening-mid.png'),fullPage:true});
  assert.equal(await page.locator('.success').count(),0,'Do not cover suitcase during opening');
  await page.locator('.quest h2').filter({hasText:'The Passport Mystery'}).waitFor({timeout:12000});
  const book=await page.locator('.passport-art').evaluate(art=>{
    const spine=art.querySelector('.passport-spine'),binding=art.querySelector('.passport-page-binding'),page=binding.querySelector('.passport-page-turn');
    const a=art.getBoundingClientRect(),p=page.getBoundingClientRect(),s=spine.getBoundingClientRect(),h=binding.getBoundingClientRect();
    return {
      inside:art.contains(page)&&art.contains(spine)&&binding.contains(page),
      spineVsLeaf:Math.abs(p.left-h.left),
      spineVsCentre:Math.abs((s.left+s.width/2)-h.left),
      bindingAtFold:Math.abs(h.left-(a.left+a.width/2)), 
      image:getComputedStyle(page,'::before').backgroundImage,
      origin:getComputedStyle(page).transformOrigin
    };
  });
  await page.screenshot({path:resolve(output,'bound-passport-before.png'),fullPage:true});
  assert.ok(book.inside,'Turning page must be DOM child of the physical book');
  assert.ok(book.spineVsLeaf<5,'Page hinge must coincide with book central spine');
  assert.ok(book.spineVsCentre<5,'Spine must coincide with the fixed page binding');
   assert.ok(book.bindingAtFold<5,'Page binding must originate at the central fold');
  assert.match(book.image,/passport.webp/);
  assert.match(book.origin,/0px/);
  for(const place of ['Rome · 08 Apr','Barcelona · 12 Apr','Lisbon · 19 Apr']){
   await page.getByRole('button',{name:place}).click();
  }
  await page.getByRole('button',{name:'Check sequence'}).click();
  await page.locator('.quest.chapter-clear .passport-art .passport-page-turn').waitFor();
  await page.waitForTimeout(1550);
  const turn=await page.locator('.passport-page-turn').evaluate(el=>{
   const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);
   return {yaw:m.m11,parent:el.parentElement?.className,inside:el.parentElement?.contains(el),stampFace:getComputedStyle(el,'::before').visibility};
  });
  assert.ok(turn.yaw<0.9,'Passport page must visibly pivot 3D around the spine');
  await page.screenshot({path:resolve(output,'bound-passport-turning-mid.png'),fullPage:true});
  assert.equal(turn.stampFace,'hidden','Do not display reversed stamp artwork on the back of the turning page');
  assert.equal(turn.parent,'passport-page-binding');
  assert.equal(turn.inside,true);
  assert.equal(await page.locator('.success').count(),0,'Do not cover turning page');
  await page.locator('.quest h2').filter({hasText:'The Secret Map'}).waitFor({timeout:12000});
  const map=await page.locator('.hero-object.map').evaluate(hero=>{
   const artwork=hero.querySelector('.map-source'),svg=artwork.querySelector('svg.map-journey');
   const route=svg.querySelector('path.map-route-trace');
   const pins=route.dataset.pinPoints.split(';').map(pair=>pair.split(',').map(Number));
   const picture=artwork.getBoundingClientRect(),overlay=svg.getBoundingClientRect();
   const totalLength=route.getTotalLength();
   const nearestDistance=(x,y)=>{
    let best=Infinity;
    for(let i=0;i<=2600;i++){
     const p=route.getPointAtLength(totalLength*i/2600);
     best=Math.min(best,Math.hypot(p.x-x,p.y-y));
    }
    return best;
   };
   const frame=hero.getBoundingClientRect();
   return{
    viewBox:svg.getAttribute('viewBox'),
    image:getComputedStyle(artwork).backgroundImage,
    sameFrame:Math.abs(picture.left-overlay.left)<2&&Math.abs(picture.top-overlay.top)<2&&
     Math.abs(picture.width-overlay.width)<2&&Math.abs(picture.height-overlay.height)<2,
    pins,distances:pins.map(([x,y])=>nearestDistance(x,y)),
    aspect:frame.width/frame.height
   };
  });
  assert.equal(map.viewBox,'0 0 900 1500');
  assert.match(map.image,/map.webp/);
  assert.equal(map.sameFrame,true,'Image and traced path must use the same native coordinate frame');
  assert.equal(map.pins.length,5,'All five photographed markers must anchor the route');
  assert.ok(map.pins.every((p,i)=>i===0||map.pins[i-1][0]<p[0]),'Pins must run left to right');
  assert.ok(map.pins[1][1]<map.pins[2][1]&&map.pins[2][1]>map.pins[3][1],
   'Golden route must dip down from second pin to third, then climb');
  assert.ok(map.distances.every(d=>d<3),
   'Gold line must touch every printed pin: '+map.distances.join(','));
  assert.ok(map.aspect>1.2&&map.aspect<1.6,'All five pins should fit the mobile viewport');
  await page.screenshot({path:resolve(output,'map-pins-aligned-before.png'),fullPage:true});
  for(const name of ['Lighthouse','Forest','Mountain peak'])
   await page.getByRole('button',{name}).click();
  await page.getByRole('button',{name:'Check sequence'}).click();
  await page.locator('.quest.chapter-clear .map-route-trace').waitFor();
  await page.waitForTimeout(850);
  const trace=await page.locator('.map-route-trace').evaluate(el=>({
   dash:parseFloat(getComputedStyle(el).strokeDashoffset),
   animation:getComputedStyle(el).animationName
  }));
  assert.equal(trace.animation,'trace-pinned-route');
  assert.ok(trace.dash>0&&trace.dash<1000,'Gold line must trace through source-image pin points');
  await page.screenshot({path:resolve(output,'map-pins-aligned-tracing-mid.png'),fullPage:true});
  await page.locator('.quest h2').filter({hasText:'The Missing Itinerary'}).waitFor({timeout:13000});
  assert.deepEqual(errors,[]);
  await page.close();
 }finally{
  await browser.close();
  await new Promise(done=>server.close(done));
 }
});


test('desktop map shows landmark pins and Check sequence separation', {timeout:55000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.goto(base+'/quest',{waitUntil:'networkidle'});
  await page.locator('select[name=preset]').selectOption('classic');
  await page.getByRole('button',{name:'Play the sample adventure'}).click();
  await page.getByRole('button',{name:/Begin the adventure/}).click();
  await page.getByRole('button',{name:'A compass'}).click();
  await page.locator('.quest h2').filter({hasText:'The Locked Suitcase'}).waitFor();
  for(const [i,num] of [[1,4],[2,2],[3,7]])
    for(let j=0;j<num;j++)await page.getByRole('button',{name:'Increase digit '+i}).click();
  await page.getByRole('button',{name:'Unlock suitcase'}).click();
  await page.locator('.quest h2').filter({hasText:'The Passport Mystery'}).waitFor();
  await assertSequenceSpacing(page,'Passport desktop');
  for(const place of ['Rome · 08 Apr','Barcelona · 12 Apr','Lisbon · 19 Apr'])
    await page.getByRole('button',{name:place}).click();
  await assertSequenceSpacing(page,'Passport selected desktop');
  await page.getByRole('button',{name:'Check sequence'}).click();
  await page.locator('.quest h2').filter({hasText:'The Secret Map'}).waitFor();
  await assertSequenceSpacing(page,'Map desktop');
  await assertLandmarkKeys(page);
  for(const place of ['Lighthouse','Forest','Mountain peak'])
    await page.getByRole('button',{name:place}).click();
  await assertSequenceSpacing(page,'Map selected desktop');
  await page.screenshot({path:resolve(output,'desktop-map-key-options-separated.png'),fullPage:true});
  await page.getByRole('button',{name:'Check sequence'}).click();
  await page.locator('.quest h2').filter({hasText:'The Missing Itinerary'}).waitFor();
  await page.close();
 }finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
});
