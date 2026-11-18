import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('public');
const server=createServer(async(req,res)=>{try{
 const p=new URL(req.url,'http://local').pathname;
 if(p==='/matrix'){res.setHeader('content-type','text/html');res.end('<div id="preview"><div id="covered"></div><div id="revealed"></div><p id="sound"></p></div>');return;}
 const f=resolve(root,'.'+p);if(!f.startsWith(root+'/'))throw Error();
 res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.jpg':'image/jpeg'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));
 }catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 for(const viewport of [{width:390,height:844},{width:1380,height:900}]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/matrix');
 const report=await page.evaluate(async()=>{
  const {POST_TEMPLATES}=await import('/post-scratch-catalogue.js');
  const expectedFields=['eventName','subtitle','recipient','date','time','venue','venueAddress','message','link'];
  for(const template of POST_TEMPLATES){
   for(const field of expectedFields)if(!template.zones.some(z=>z.key===field))throw Error(template.id+' missing '+field);
   if(!template.zones.some(z=>['sender','senderLine'].includes(z.key)))throw Error(template.id+' missing sender');
   if(template.id!=='custom-image'){
    if(!template.structured||!template.panels||(!template.approvedArtwork&&template.panels.length<8))throw Error(template.id+' missing structured layout');
    const all=[...template.zones,template.photo];
    for(const zone of all)if(zone.x<0||zone.y<0||zone.x+zone.w>900||zone.y+zone.h>1200)throw Error(template.id+' outside card');
    for(const [i,a] of all.entries())for(const b of all.slice(i+1)){
     if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)throw Error(template.id+' overlapping zones '+(a.key||'photo')+' '+(b.key||'photo'));
    }
   }
  }
  const {SCRATCH_ARTWORKS}=await import('/scratch-artwork-catalogue.js');
  const {renderScratchOwnerPreview}=await import('/scratch-owner-preview.js');
  const {renderPostScratchFace}=await import('/post-scratch-face.js');
  const section=document.querySelector('#preview');section.style.maxWidth='490px';
  const reveal={recipient:'Chloe',sender:'Michael',eventName:'A wonderful surprise',eventDate:'2027-04-10',eventTime:'19:30',venue:'Theatre Royal',personalMessage:'Happy birthday! We are going to an unforgettable evening together.',ticketUrl:'https://example.org/',hasImage:true};
  const image='/post-scratch-artwork/editorial.webp';
  const issues=[];let count=0;
  for(const template of POST_TEMPLATES)for(const artwork of SCRATCH_ARTWORKS){
   const surface={style:'classic',foil:'gold',variant:'ticket',artworkId:artwork.id,postScratch:{templateId:template.id,subtitle:'Just for you',venueAddress:'London',imagePosition:'xMaxYMin',imageFit:'cover',imageOrientation:'landscape',imageZoom:175,imagePanX:20,imagePanY:-15,textContrast:'dark',shade:45}};
   const scratch=await renderScratchOwnerPreview(section,{reveal,surface,artwork,eventImage:image,audio:{enabled:false},hosts:{covered:document.querySelector('#covered'),revealed:document.querySelector('#revealed'),sound:document.querySelector('#sound')}});
   const a=document.querySelector('#covered').shadowRoot.querySelector('#card'),b=document.querySelector('#revealed').shadowRoot.querySelector('#card');
   for(const card of [a,b]){const r=card.getBoundingClientRect();if(Math.abs(r.width/r.height-.75)>.001)issues.push(template.id+' ratio '+r.width/r.height);if(card.dataset.textOverflow)issues.push(template.id+' overflow '+card.dataset.textOverflow);if(card.querySelectorAll('svg [data-field]:not([data-field="image-placeholder"])').length!==10)issues.push(template.id+' incomplete ten fields');}
   if(getComputedStyle(a.querySelector('#underlay')).visibility!=='hidden')issues.push('covered data visible');
   if(getComputedStyle(b.querySelector('#underlay')).visibility!=='visible')issues.push('reveal invisible');
   if(getComputedStyle(a.querySelector('canvas')).pointerEvents!=='none')issues.push('owner interactive');
   if(template===POST_TEMPLATES[0]){const pixels=a.querySelector('canvas').getContext('2d').getImageData(1,1,1,1).data;if(!pixels[3])issues.push('empty cover');}
   // Render recipient with same input and compare text plus SVG geometry attributes.
   const recipient=document.createElement('div');document.body.append(recipient);recipient.style.width=b.getBoundingClientRect().width+'px';
   await renderPostScratchFace(recipient,reveal,surface.postScratch,image);
   const normalize=svg=>svg.outerHTML.replace(/post-scratch-\d+/g,'post-scratch-ID').replace(/-?\d+\.\d+/g,n=>String(Math.round(Number(n)*10)/10));
   if(normalize(recipient.querySelector('svg'))!==normalize(b.querySelector('svg'))){const x=normalize(recipient.querySelector('svg')),y=normalize(b.querySelector('svg')),i=[...x].findIndex((c,i)=>c!==y[i]);issues.push(template.id+' renderer mismatch: '+x.slice(i-70,i+100)+' vs '+y.slice(i-70,i+100));}
   recipient.remove();count++;
  }
  return {count,expected:POST_TEMPLATES.length*SCRATCH_ARTWORKS.length,issues};
 });
 assert.equal(report.count,report.expected);assert.deepEqual(report.issues,[]);assert.deepEqual(errors,[]);
 await mkdir('test-output/post-scratch',{recursive:true});await page.screenshot({path:'test-output/post-scratch/matrix-'+viewport.width+'.png'});
 console.log(viewport.width+'px: all '+report.count+' combinations passed');await page.close();
 // One actual, populated recipient-side card per design at this viewport.
 const gallery=await browser.newPage({viewport});
 await gallery.goto(base+'/matrix');
 const templates=await gallery.evaluate(async()=>{
  const {POST_TEMPLATES}=await import('/post-scratch-catalogue.js');
  const {renderPostScratchFace}=await import('/post-scratch-face.js');
  const list=document.getElementById('preview');
  list.style.cssText='width:min(100%,454px);margin:0 auto;display:grid;gap:24px';
  const poster=document.createElement('canvas');poster.width=800;poster.height=1000;
  const ctx=poster.getContext('2d');
  const g=ctx.createLinearGradient(0,0,800,1000);g.addColorStop(0,'#151b3c');g.addColorStop(.48,'#412a55');g.addColorStop(1,'#111327');ctx.fillStyle=g;ctx.fillRect(0,0,800,1000);
  for(let i=0;i<18;i++){const x=(i*173)%800,y=70+(i*47)%380;ctx.fillStyle=i%2?'#edb46f':'#e8e8ff';ctx.beginPath();ctx.arc(x,y,3+(i%4)*2,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#f6cf88';ctx.textAlign='center';ctx.font='700 48px Georgia';ctx.fillText('THEATRE NIGHT',400,180);
  ctx.strokeStyle='#dfad73';ctx.lineWidth=5;ctx.strokeRect(38,38,724,924);
  ctx.fillStyle='#e4b875';ctx.beginPath();ctx.moveTo(400,275);ctx.lineTo(530,590);ctx.lineTo(270,590);ctx.closePath();ctx.fill();
  ctx.fillStyle='#261d36';ctx.beginPath();ctx.arc(400,435,70,0,Math.PI*2);ctx.fill();ctx.fillRect(350,496,100,124);
  ctx.fillStyle='#fff0cd';ctx.font='600 38px Georgia';ctx.fillText('A SPECIAL EVENING',400,790);ctx.font='28px Arial';ctx.fillText('20 MARCH 2027',400,845);
  const samplePoster=poster.toDataURL('image/png');
  for(const template of POST_TEMPLATES){
   const card=document.createElement('div');card.id='template-'+template.id;list.append(card);
   await renderPostScratchFace(card,{eventName:'Jesus Christ Superstar',recipient:'Chloe',sender:'Michael',eventDate:'2027-03-20',eventTime:'19:30',venue:'Theatre Royal',personalMessage:'A special evening out, just for you.',ticketUrl:'https://example.org'},{templateId:template.id,subtitle:'A night to remember',venueAddress:'Drury Lane, London'},samplePoster);
   if(card.dataset.textOverflow)throw Error(template.id+' overflow '+card.dataset.textOverflow);
  }
  return POST_TEMPLATES.map(t=>t.id);
 });
 for(const id of templates)await gallery.locator('#template-'+id).screenshot({path:'test-output/post-scratch/'+viewport.width+'-'+id+'.png'});
 if(viewport.width===1380){
  // A full 15-design visual proof, with the same sample data on each card.
  await gallery.setViewportSize({width:1250,height:1150});
  await gallery.locator('#preview').evaluate(list=>{
   list.style.cssText='width:1220px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 auto;background:#e8e5dc';
   for(const card of list.querySelectorAll(':scope > [id^=template-]')){
    const label=document.createElement('p');label.textContent=card.id.replace('template-','');label.style.cssText='margin:3px 0 8px;text-align:center;font:600 12px Arial;color:#202020';card.append(label);
   }
  });
  const image=await gallery.locator('#preview').screenshot({path:'test-output/post-scratch/all-designs.jpg',type:'jpeg',quality:82});
  // Log small chunks so the visual audit can inspect the actual render,
  // without depending on access to binary workflow artifacts.
  const encoded=image.toString('base64');
  for(let i=0;i<encoded.length;i+=5000)console.log('GALLERY_IMAGE '+encoded.slice(i,i+5000));
 }
 await gallery.close();
 }
 // Actual creator page: all 15 options, custom controls and amend restoration.
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const surface={variant:'ticket',style:'classic',foil:'gold',artworkId:'champagne-ribbons',postScratch:{templateId:'custom-image',subtitle:'Saved subtitle',venueAddress:'Saved address',imagePosition:'xMaxYMin',imageFit:'cover',imageOrientation:'portrait',imageZoom:175,imagePanX:20,imagePanY:-15,textContrast:'dark',shade:45}};
 await page.addInitScript(()=>localStorage.setItem('reveal_edit_saved','owner'));
 await page.route('**/api/reveals/saved',r=>r.fulfill({json:{success:true,reveal:{id:'saved',recipient:'Chloe',sender:'Michael',eventName:'Saved surprise',hasImage:true,status:'draft',revision:1}}}));
 await page.route('**/api/reveals/saved/scratch-surface',r=>r.fulfill({json:{success:true,surface,audio:{enabled:false}}}));
 await page.route('**/api/reveals/saved/image',r=>r.fulfill({contentType:'image/webp',path:resolve(root,'post-scratch-artwork/editorial.webp')}));
 await page.goto(base+'/legacy-create.html?edit=saved');await page.locator('#reviewButton:enabled').waitFor();
 assert.equal(await page.locator('#postTemplate option').count(),79);assert.equal(await page.locator('#postTemplate').inputValue(),'custom-image');
 assert.equal(await page.locator('#postSubtitle').inputValue(),'Saved subtitle');
 assert.equal(await page.locator('#eventName:visible,#postSubtitle:visible,#postVenueAddress:visible').count(),0);assert.equal(await page.locator('#postVenueAddress').inputValue(),'Saved address');
 assert.equal(await page.locator('#postImagePosition').inputValue(),'xMaxYMin');assert.equal(await page.locator('#postTextContrast').inputValue(),'dark');assert.equal(await page.locator('#postShade').inputValue(),'45');
 for(const [id,value] of Object.entries({postImageFit:'cover',postImageOrientation:'portrait',postImageZoom:'175',postImagePanX:'20',postImagePanY:'-15'}))assert.equal(await page.locator('#'+id).inputValue(),value);
 await page.locator('[data-scratch-preview-mode="revealed"]').click();
 await page.locator('#scratchActualRevealed svg[data-post-template="custom-image"]').waitFor({state:'attached'});
 assert.equal(await page.locator('#scratchCreatorActual').getAttribute('data-preview-mode'),'revealed');
 assert.equal(await page.locator('#scratchActualCovered').getAttribute('aria-hidden'),'true');
 assert.equal(await page.locator('#scratchActualRevealed').getAttribute('aria-hidden'),null);
 assert.equal(await page.locator('#scratchActualRevealed [data-edit-field="postSubtitle"]').inputValue(),'Saved subtitle');
 assert.equal(await page.locator('#scratchActualRevealed [data-edit-field="postVenueAddress"]').inputValue(),'Saved address');
 const visibleSaved=await page.locator('#scratchActualRevealed').evaluate(host=>{
  const root=host.shadowRoot,slot=root.querySelector('[data-slot="eventName"]'),t=slot.querySelector('[data-field]'),z=slot.querySelector(':scope > rect'),b=t.getBBox(),m=t.transform.baseVal.consolidate()?.matrix||new DOMMatrix();
  const a=new DOMPoint(b.x,b.y).matrixTransform(m),c=new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(m);
  const x=Number(z.getAttribute('x')),y=Number(z.getAttribute('y')),w=Number(z.getAttribute('width')),h=Number(z.getAttribute('height'));
  return b.width>0&&b.height>0&&a.x>=x-1&&a.y>=y-1&&c.x<=x+w+1&&c.y<=y+h+1;
 });assert.equal(visibleSaved,true,'Saved title is visibly inside its field on Amend');
 await page.locator('#scratchActualRevealed [data-edit-field="postSubtitle"]').focus();
 await page.locator('#scratchActualRevealed [data-edit-field="postSubtitle"]').fill('Edited on ticket');
 assert.equal(await page.locator('#postSubtitle').inputValue(),'Edited on ticket');
 await page.locator('#postTemplate').focus();
 await page.locator('#postImageZoom').fill('200');
 await page.waitForFunction(()=>document.querySelector('#scratchActualRevealed').shadowRoot.querySelector('[data-photo-slot] image')?.getAttribute('width')==='1800');
 await page.locator('#postImageReset').click();
 await page.waitForFunction(()=>document.querySelector('#scratchActualRevealed').shadowRoot.querySelector('[data-photo-slot] image')?.getAttribute('width')==='900');
 assert.equal(await page.locator('#postImageZoom').inputValue(),'100');
 assert.equal(await page.locator('#postImageOrientation').inputValue(),'auto');
 assert.equal(await page.evaluate(()=>{const upload=document.querySelector('#scratchImageUpload'),editor=document.querySelector('#postImageControls'),link=document.querySelector('#ticketUrl');return upload.nextElementSibling===editor&&Boolean(link.compareDocumentPosition(upload)&Node.DOCUMENT_POSITION_FOLLOWING)&&upload.getBoundingClientRect().bottom<=editor.getBoundingClientRect().top&&document.querySelector('#imageUploadLabel').textContent==='Add Image (Optional)';}),true,'Upload immediately precedes image editor with exact label');
 assert.equal(await page.evaluate(()=>{const editor=document.querySelector('#postImageControls'),review=document.querySelector('#reviewButton');return editor.parentElement===review.parentElement&&editor.getBoundingClientRect().bottom<=review.getBoundingClientRect().top;}),true,'Image editor precedes review');
 assert.equal(await page.locator('#postTextContrast').inputValue(),'light');
 assert.equal(await page.locator('#postShade').inputValue(),'70');
 assert.equal(await page.locator('#venue:visible,#postVenueAddress:visible').count(),0);
 for(const option of await page.locator('#postTemplate option').evaluateAll(nodes=>nodes.map(n=>n.value))){
  await page.locator('#postTemplate').selectOption(option);
  assert.equal(await page.locator('#postImageControls').isVisible(),true);
  assert.equal(await page.locator('#postImageZoom').isEnabled(),true);
   assert.equal(await page.locator('#postImageOrientation').isEnabled(),true);
   await page.locator('#postImageOrientation').selectOption('landscape');
   await page.locator('#postImageOrientation').selectOption('portrait');
  assert.equal(await page.locator('#postImageReset').isVisible(),true);
  assert.equal(await page.locator('#postImageReset').isEnabled(),true);
 }
 assert.equal(await page.locator('#postImagePanX').inputValue(),'0');
 await page.screenshot({path:'test-output/post-scratch/amend-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Creator Amend restores all template fields and image appearance');
 await page.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
