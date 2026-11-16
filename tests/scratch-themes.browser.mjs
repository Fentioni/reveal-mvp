import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {SCRATCH_ARTWORKS,DEFAULT_SCRATCH_ARTWORK} from '../public/scratch-artwork-catalogue.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)),'public');
const browserType=process.env.SCRATCH_BROWSER==='webkit'?webkit:chromium;
const browserName=process.env.SCRATCH_BROWSER==='webkit'?'webkit':'chromium';
const output=resolve(fileURLToPath(new URL('..',import.meta.url)),'test-output','scratch-'+browserName);
const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const sample={
 success:true,
 scratchSurface:{artworkId:DEFAULT_SCRATCH_ARTWORK,style:'classic',foil:'gold',variant:'ticket',hasImage:false},
 audio:{enabled:false},
 reveal:{recipient:'Chloe',sender:'Michael',eventName:'A surprise to remember',
  eventDate:'2027-03-12',eventTime:'19:00',venue:'The Grand Hall',admit:'Two guests',
  personalMessage:'Something wonderful awaits',ticketUrl:null,hasEventImage:false}
};
async function startServer(){
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const jpg=SCRATCH_ARTWORKS.find(item=>path===item.src);
  if(jpg){
   // Synthetic artwork is deliberate: browser routing/Canvas tests must not
   // pretend that the user's actual JPEG files have already been uploaded.
   const n=SCRATCH_ARTWORKS.indexOf(jpg);
   const color='#'+((n*423721+0x244466)&0xffffff).toString(16).padStart(6,'0');
   res.writeHead(200,{'content-type':'image/svg+xml','cache-control':'no-store'});
   res.end('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="'+color+'"/></svg>');
   return;
  }
   const foilName=path.match(/^\/r\/concert-foil-(gold|silver|midnight|rose)\/scratch-data$/)?.[1];
   if(foilName){
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({...sample,scratchSurface:{
      style:'concert',foil:foilName,variant:'concert',hasImage:false}}));
    return;
   }
   if(path==='/r/concert-qr/scratch-data'){
     res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
     res.end(JSON.stringify({...sample,scratchSurface:{
       style:'concert',foil:'rose',variant:'concert',hasImage:false,
       ticketTemplate:'rounded-stub',revealTheme:'backstage',linkMode:'qr',
       ticketDetails:{ticketNumber:'T-123',section:'Balcony',row:'G',seat:'18',gate:'A2',venueAddress:'London, England'}
     },reveal:{...sample.reveal,ticketUrl:'https://example.org/concert?t=42'}}));
     return;
   }
   const design=path.match(/^\/concert-reveal-art\/(classic|concert-lights|festival|backstage)\.svg$/)?.[1];
   if(design){
     res.writeHead(200,{'content-type':'image/svg+xml'});
     res.end(await readFile(resolve(root,'concert-reveal-art',design+'.svg')));
     return;
   }
  const slug=path.match(/^\/r\/artwork-([a-z-]+)\/scratch-data$/)?.[1];
  const art=SCRATCH_ARTWORKS.find(item=>item.id===slug);
  if(art){
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
   res.end(JSON.stringify({...sample,scratchSurface:{...sample.scratchSurface,artworkId:art.id}}));
   return;
  }
  const file=path==='/legacy-create'?'/legacy-create.html'
    :path.match(/^\/r\/(?:artwork-[a-z-]+|concert-foil-(?:gold|silver|midnight|rose)|concert-qr)$/)?'/recipient-scratch.html'
   :path;
  if(!/^\/(?:legacy-create\.html|recipient-scratch\.html|scratch-artwork-catalogue\.js|concert-ticket-options\.js|concert-ticket-fields\.js|concert-live-preview\.js|concert-ticket-premium\.css|qr\.js|scratchcard\.js|scratch-themes\.js|scratch-theme-art\.js|scratch-audio\.js|scratch-recipient-fields\.js)$/.test(file)){
   res.writeHead(404);res.end('Not found');return;
  }
  try{
   const buf=await readFile(resolve(root,file.slice(1)));
   res.writeHead(200,{'content-type':type[extname(file)]||'application/octet-stream'});
   res.end(buf);
  }catch{
   res.writeHead(404);res.end('Not found');
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{server,base:'http://127.0.0.1:'+server.address().port};
}
test('creator shows only the 20-artwork dropdown without the retired foil section on phone or desktop',
 {timeout:100000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 await mkdir(output,{recursive:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.goto(base+'/legacy-create',{waitUntil:'networkidle'});
   await page.locator('#scratchArtwork:enabled').waitFor();
   assert.equal(await page.locator('#scratchArtwork option').count(),20);
   assert.equal(await page.locator('.scratch-theme-option').count(),0);
   assert.equal(await page.locator('[data-scratch-foil]:visible').count(),0);
   assert.equal(await page.locator('#surfaceHeading:visible').count(),0);
   assert.equal(await page.locator('#surfaceDescription:visible').count(),0);
   assert.equal(await page.locator('#scratchFoilLabel:visible').count(),0);
   assert.equal(await page.locator('#scratchFoilGrid:visible').count(),0);
   assert.equal(await page.locator('#image').count(),1);
   assert.equal(await page.locator('#scratchArtwork').inputValue(),DEFAULT_SCRATCH_ARTWORK);
   assert.equal(await page.locator('#scratchFoil').inputValue(),'gold');
   const paintings=new Set();
   for(const art of SCRATCH_ARTWORKS){
    await page.locator('#scratchArtwork').selectOption(art.id);
    await page.waitForFunction(id=>document.querySelector('#scratchArtwork')?.value===id,art.id);
    await page.waitForTimeout(75);
    assert.equal(await page.locator('#scratchFoil').inputValue(),'gold');
    paintings.add(await page.locator('#scratchSurfacePreview').evaluate(canvas=>canvas.toDataURL('image/png')));
   }
   assert.equal(paintings.size,20,'Each approved artwork must actually repaint the surface Canvas');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=2,'No horizontal overflow on '+size.name+': '+overflow);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(output,size.name+'-final-20-dropdown.png'),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('Concert Ticket exclusively shows four foil finishes with no redundant headings or scratch-face watermarks',
 {timeout:95000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/legacy-create?variant=concert',{waitUntil:'networkidle'});
   await page.locator('#scratchFoilGrid:visible').waitFor();
   assert.equal(await page.locator('#scratchArtworkSection:visible').count(),0);
   const uploadHelp=await page.locator('#imageUploadHelp').textContent();
   for(const hint of ['JPEG','PNG','WebP','10 MB','400 × 240','1200 × 1600','cropped']){
     assert.ok(uploadHelp.includes(hint),'Upload guidance must include '+hint);
   }
   assert.equal(await page.locator('#eventDate').evaluate(e=>getComputedStyle(e).colorScheme),'dark');
   assert.equal(await page.locator('#eventTime').evaluate(e=>getComputedStyle(e).colorScheme),'dark');
   assert.equal(await page.locator('#surfaceHeading').count(),0);
   assert.equal(await page.locator('#surfaceDescription').count(),0);
   assert.equal(await page.locator('#scratchFoilLabel:visible').count(),1);
   assert.equal((await page.locator('#scratchFoilLabel').textContent()).trim(),'2. Scratch colour');
   assert.equal(await page.locator('#scratchFoilGrid [data-scratch-foil]:visible').count(),4);
   assert.equal(await page.locator('#scratchArtGrid').count(),0,'Old scratch artwork choices must stay removed');
   assert.equal(await page.locator('.concert-template-option').count(),4);
   assert.equal(await page.locator('.concert-theme-option').count(),4);
   assert.equal(await page.locator('#concertLinkModeField:visible').count(),1);
   assert.equal(await page.locator('#concertEventUploadDock:visible').count(),1);
   assert.equal(await page.locator('#image').count(),1);
   assert.equal(await page.locator('#scratchArtwork').getAttribute('required'),null);
   assert.equal(await page.locator('#concertPreviewTabsDesktop:visible').count(),1);
   assert.equal(await page.locator('#concertPreviewTabsMobile:visible').count(),0);
   const layout=await page.evaluate(()=>{
     const rect=id=>{const x=document.querySelector(id).getBoundingClientRect();return {top:x.top,left:x.left,right:x.right,bottom:x.bottom,width:x.width};};
     return {preview:rect('.preview-column'),template:rect('#concertTemplateSection'),
       foil:rect('#scratchFoilGrid'),theme:rect('#concertThemeSection'),
       frame:rect('.scratch-static-frame')};
   });
   assert.ok(layout.preview.bottom <= layout.template.top+4,'Full-width ticket preview must appear above ticket selectors');
   assert.ok(layout.frame.width > (size.name==='desktop'?740:310),'Ticket must use substantially more width than before');
   if(size.name==='desktop'){
     assert.ok(layout.theme.left > layout.template.right,'Revealed artwork belongs in right column');
     assert.ok(Math.abs(layout.theme.top-layout.template.top)<40,'Template and theme choices start together');
     assert.ok(layout.foil.top > layout.template.top,'Scratch colours belong below templates on the left');
   }else{
     assert.ok(layout.theme.top > layout.foil.bottom,'Phone layout stacks theme after template and foil');
   }
   const silhouettes=new Set(),shapeCanvases=new Set();
   for(const template of ['side-perforations','stamp-edge','classic-notches','rounded-stub']){
     await page.locator('.concert-template-option[data-value="'+template+'"]').click();
     assert.equal(await page.locator('.concert-template-option[data-value="'+template+'"]').getAttribute('aria-pressed'),'true');
     silhouettes.add(await page.locator('.scratch-static-frame').evaluate(el=>getComputedStyle(el).clipPath));
     shapeCanvases.add(await page.locator('#scratchSurfacePreview').evaluate(canvas=>canvas.toDataURL('image/png')));
   }
   assert.equal(silhouettes.size,4,'Four distinct ticket cutout shapes must be applied to the preview');
   assert.equal(shapeCanvases.size,4,'Changing templates must redraw the scratch surface shape');
   for(const theme of ['classic','concert-lights','festival','backstage']){
     await page.locator('.concert-theme-option[data-value="'+theme+'"]').click();
     assert.equal(await page.locator('.concert-theme-option[data-value="'+theme+'"]').getAttribute('aria-pressed'),'true');
   }
   await page.locator('#concertLinkMode').selectOption('qr');
   assert.equal(await page.locator('#concertLinkMode').inputValue(),'qr');
   const paintings=new Set();
   const centreColours=new Set();
   const visibleGradients=new Set();
   for(const foil of ['gold','silver','midnight','rose']){
    await page.locator('[data-scratch-foil="'+foil+'"]').click();
    await page.waitForFunction(id=>document.querySelector('#scratchFoil').value===id,foil);
    const centre=await page.locator('#scratchSurfacePreview').evaluate(canvas=>{
      const context=canvas.getContext('2d',{willReadFrequently:true});
      return [...context.getImageData(Math.floor(canvas.width*.43),Math.floor(canvas.height*.54),1,1).data].slice(0,3);
    });
    centreColours.add(centre.join(','));
    paintings.add(await page.locator('#scratchSurfacePreview').evaluate(canvas=>canvas.toDataURL('image/png')));
    const surface=await page.locator('.scratch-static-frame').evaluate(el=>({
      foil:el.dataset.foil,
      gradient:getComputedStyle(el).backgroundImage,
      canvasOpacity:getComputedStyle(el.querySelector('canvas')).opacity
    }));
    assert.equal(surface.foil,foil,'The visible ticket, not just its border, must reflect selected foil');
    assert.equal(surface.canvasOpacity,'0','Creator must display the static foil, not an unpainted Canvas');
    assert.ok(surface.gradient.startsWith('linear-gradient('),'Visible foil must fill the whole ticket');
    visibleGradients.add(surface.gradient);
    await page.screenshot({path:resolve(output,size.name+'-concert-'+foil+'.png'),fullPage:true});
   }
   assert.equal(paintings.size,4,'Each concert foil option must repaint the ticket');
   assert.equal(centreColours.size,4,'The underlying recipient Canvas must retain four genuine foil paints');
   assert.equal(visibleGradients.size,4,'The visible creator ticket must show four different full-size metallic colour gradients');
   const ratio=await page.locator('#scratchSurfacePreview').evaluate(node=>{
    const bounds=node.getBoundingClientRect();return bounds.width/bounds.height;
   });
   assert.ok(Math.abs(ratio-2.15)<.15,'Concert preview stays landscape');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(output,size.name+'-concert-foil-options.png'),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('concert purchaser can switch between scratch cover and a fully personalised live revealed-ticket preview',
 {timeout:95000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/legacy-create?variant=concert',{waitUntil:'networkidle'});
   await page.locator('#concertTemplateChoices .concert-template-option:enabled').first().waitFor();
   const tabSelector='#concertPreviewTabsDesktop';
   assert.equal(await page.locator(tabSelector+':visible').count(),1);
   await page.locator('#recipient').fill('Chloe');
   await page.locator('#sender').fill('Michael');
   await page.locator('#personalMessage').fill('A night to remember!');
   await page.locator('#eventName').fill('Live Music at the Hall');
   await page.locator('#eventSubtitle').fill('A very special evening');
   await page.locator('#venue').fill('The Grand Hall');
   await page.locator('#venueAddress').fill('London, England');
   await page.locator('#level').fill('3');
   await page.locator('#section').fill('Balcony');
   await page.locator('#row').fill('G');
   await page.locator('#seat').fill('18');
   await page.locator('#gate').fill('A');
   assert.equal(await page.locator('#ticketPrice').count(),0,'No ticket price or face-value field');
   assert.equal(await page.locator('#ticketNumber').count(),0,'Ticket number field is removed');
   assert.equal(await page.locator('#supportAct').count(),0,'Special guest field is removed');
   assert.equal(await page.locator('#concertTicketDetailsSection [required]').count(),0,
     'All ticket information fields remain optional');
   await page.locator('#eventDate').fill('2027-03-20');
   await page.locator('#eventTime').fill('19:30');
   await page.locator('#ticketUrl').fill('https://example.org/tickets/123');
   await page.locator('#concertLinkMode').selectOption('qr');
   await page.locator('.concert-template-option[data-value="stamp-edge"]').click();
   await page.locator('.concert-theme-option[data-value="concert-lights"]').click();
   assert.equal(await page.locator('body').getAttribute('data-concert-preview'),'revealed');
   assert.equal(await page.locator('#concertRevealedPreviewFrame:visible').count(),1);
   assert.equal(await page.locator('.scratch-static-frame:visible').count(),0);
   assert.equal((await page.locator('#concertLiveEvent').textContent()).trim(),'Live Music at the Hall');
   const details=await page.locator('#concertLiveFields').textContent();
   for(const value of ['The Grand Hall','London, England']){
    assert.ok(details.includes(value),'Main ticket must include '+value);
   }
   const stubDetails=await page.locator('#concertLiveStubFields').textContent();
   for(const value of ['Balcony','G','18','A']){
    assert.ok(stubDetails.includes(value),'Detachable ticket stub must include '+value);
   }
   assert.equal(await page.locator('#ticketPrice').count(),0);
   assert.equal(await page.locator('#concertLiveFields [value*="£"]').count(),0);
   const liveRect=await page.locator('#concertRevealedPreviewFrame').boundingBox();
   assert.ok(Math.abs(liveRect.width/liveRect.height-2.15)<.13,
     'Revealed preview must retain exact ticket proportions, never grow into a poster');
   const bottomSpace=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
     const last=frame.querySelector('#concertLiveFields > div:last-child');
     return {height:frame.getBoundingClientRect().height,
       remaining:frame.getBoundingClientRect().bottom-last.getBoundingClientRect().bottom,
       pad:getComputedStyle(frame.querySelector('.concert-live-main')).paddingBottom};
   });
   assert.ok(bottomSpace.remaining >= bottomSpace.height*(size.name==='desktop'?.11:.075),
     'Last concert ticket detail must sit safely above the bottom border: '+JSON.stringify(bottomSpace));
   assert.equal((await page.locator('#concertLiveSubtitle').textContent()).trim(),'A very special evening');
   assert.match(await page.locator('#concertLiveRecipient').textContent(),/Chloe/);
   assert.equal(await page.locator('#concertLiveSender:visible').count(),0,
     'Sender belongs with the personal message, not another vertical stub stripe');
   assert.equal((await page.locator('#concertLiveMessage').textContent()).trim(),'A night to remember!');
   assert.equal(await page.locator('#concertLiveQr svg').count(),1);
   const background=await page.locator('#concertRevealedPreviewFrame').evaluate(e=>getComputedStyle(e).backgroundImage);
   assert.ok(background.includes('concert-lights.svg'));
   if(size.name==='mobile'){
     await page.locator('#concertZoomButton').click();
     assert.equal(await page.locator('body').getAttribute('data-concert-zoom'),'open');
     const pan=await page.locator('#scratchDesktopDock').evaluate(el=>({
       client:el.clientWidth,scroll:el.scrollWidth
     }));
     assert.ok(pan.scroll>pan.client+250,'Full-size ticket preview must be horizontally inspectable on phones');
     await page.locator('#concertZoomButton').click();
   }

   // Realistically sized portrait photo to exercise the overlap on iPhone.
   await page.evaluate(async()=>{
     const canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;
     const context=canvas.getContext('2d');
     context.fillStyle='#3c3355';context.fillRect(0,0,600,800);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
     const transfer=new DataTransfer();
     transfer.items.add(new File([blob],'concert-poster.png',{type:'image/png'}));
     const input=document.getElementById('image');
     input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.locator('#concertLiveImage:not([hidden])').waitFor();
   const photoLayout=await page.locator('#concertRevealedPreviewFrame').evaluate(frame=>{
     const art=frame.querySelector('#concertLiveImage').getBoundingClientRect();
     const content=[...frame.querySelector('.concert-live-main').children].filter(el=>
       el.id!=='concertLiveImage'&&!el.hidden&&getComputedStyle(el).display!=='none');
     return {photoLeft:art.left,textRight:Math.max(...content.map(el=>el.getBoundingClientRect().right))};
   });
   assert.ok(photoLayout.textRight+2<=photoLayout.photoLeft,
     'Event poster must never cover preview ticket text: '+JSON.stringify(photoLayout));
   await page.screenshot({path:resolve(output,size.name+'-live-revealed-ticket.png'),fullPage:true});
   await page.locator(tabSelector+' [data-preview-mode="cover"]').click();
   assert.equal(await page.locator('.scratch-static-frame:visible').count(),1);
   assert.equal(await page.locator('#concertRevealedPreviewFrame:visible').count(),0);
   await page.locator('[data-scratch-foil="rose"]').click();
   assert.equal(await page.locator('#scratchFoil').inputValue(),'rose');
   await page.screenshot({path:resolve(output,size.name+'-scratch-cover-after-reveal.png'),fullPage:true});
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('paid concert recipient sees four full-surface foil colours, even on narrow phones',
 {timeout:95000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const pixels=new Set();
   for(const foil of ['gold','silver','midnight','rose']){
    await page.goto(base+'/r/concert-foil-'+foil,{waitUntil:'networkidle'});
    await page.locator('#card.foil-ready').waitFor();
    assert.equal(await page.locator('body').getAttribute('data-ticket-variant'),'concert');
    assert.equal((await page.locator('.eyebrow').textContent()).trim(),'Concert ticket');
    assert.equal(await page.locator('#progress').getAttribute('value'),'0');
    const pixel=await page.locator('#foilCanvas').evaluate(canvas=>{
      const context=canvas.getContext('2d',{willReadFrequently:true});
      return [...context.getImageData(Math.floor(canvas.width*.42),Math.floor(canvas.height*.55),1,1).data].slice(0,3);
    });
    pixels.add(pixel.join(','));
   }
   assert.equal(pixels.size,4,'Paid recipient ticket must change colour across whole scratch foil');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(output,size.name+'-concert-recipient-rose.png'),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('amending a saved Concert Ticket never displays the 20-artwork Scratch Card editor, including old edit links',
 {timeout:70000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  for(const suffix of ['','&variant=concert']){
   const page=await browser.newPage({viewport:{width:1120,height:820},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
     try{localStorage.setItem('reveal_edit_saved-concert','owner-test-token')}catch{}
   });
   let release;
   const gate=new Promise(resolve=>{release=resolve});
   await page.route('**/api/reveals/saved-concert/scratch-surface',route=>route.fulfill({
     status:200,contentType:'application/json',body:JSON.stringify({
       success:true,surface:{variant:'concert',style:'concert',foil:'midnight',
         hasImage:false,ticketTemplate:'side-perforations',revealTheme:'concert-lights',linkMode:'link',
         ticketDetails:{seat:'18',row:'G'}},audio:{enabled:false}
     })
   }));
   await page.route('**/api/reveals/saved-concert',async route=>{
     await gate;
     await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
       success:true,reveal:{status:'draft',revision:1,recipient:'Chloe',sender:'Michael',
       eventName:'Live in Concert',eventDate:'2027-04-20',eventTime:'19:00',
       venue:'Royal Hall',admit:'Two',hasImage:false,personalMessage:'Surprise!',ticketUrl:''}
     })});
   });
   try{
    await page.goto(base+'/legacy-create?edit=saved-concert'+suffix,{waitUntil:'domcontentloaded'});
    await page.locator('#savedRevealLoadStatus:visible').waitFor();
    assert.equal(await page.locator('.page:visible').count(),0,
      'No generic Scratch Card creator must be visible while saved concert details load');
    assert.equal(await page.locator('#scratchArtworkSection:visible').count(),0);
   }finally{release()}
   await page.locator('#concertTemplateSection:visible').waitFor();
   assert.equal(await page.locator('body').getAttribute('data-ticket-variant'),'concert');
   assert.equal(await page.locator('#scratchArtworkSection:visible').count(),0);
   assert.equal(await page.locator('#scratchFoil').inputValue(),'midnight');
   assert.equal(await page.locator('#concertRevealedPreviewFrame').count(),1);
   assert.equal(await page.locator('#savedRevealLoadStatus:visible').count(),0);
   assert.equal((await page.locator('#concertLiveEvent').textContent()).trim(),'Live in Concert');
   assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('concert owner static review remains a landscape 2.15:1 ticket, not a tall poster',
 {timeout:40000},async()=>{
 const browser=await browserType.launch({headless:true});
 try{
  const source=await readFile(resolve(root,'reveal.html'),'utf8');
  const style=await readFile(resolve(root,'concert-ticket-premium.css'),'utf8');
   const html=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
     .replace('</head>','<style>'+style+'</style></head>');
  for(const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1380,height:900}]){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce'});
   await page.setContent(html,{waitUntil:'domcontentloaded'});
   // A page created via setContent has no site origin; load the same
   // production Concert Ticket stylesheet directly for a meaningful
   // owner-review visual acceptance instead of testing only inline CSS.
   await page.addStyleTag({content:await readFile(resolve(root,'concert-ticket-premium.css'),'utf8')});
   await page.evaluate(()=>{
     document.body.dataset.ticketVariant='concert';
     document.getElementById('reviewContent').hidden=false;
     document.getElementById('reviewEventHeading').textContent='Chloe';
     document.getElementById('ticketTitle').textContent='Jesus Christ Superstar';
     document.getElementById('reviewVenueRow').hidden=false;
     document.getElementById('reviewVenue').textContent='Theatre Royal, Drury Lane';
     document.getElementById('reviewDateRow').hidden=false;
     document.getElementById('reviewDate').textContent='Saturday, 21 November 2026';
     document.getElementById('reviewTimeRow').hidden=false;
     document.getElementById('reviewTime').textContent='21:12';
     const extra=document.getElementById('reviewConcertExtra');
     extra.hidden=false;
     for(const [label,value] of [['VENUE ADDRESS','Example Street, London'],['LEVEL','3']]){
       const cell=document.createElement('div');
       const name=document.createElement('span');name.className='detail-label';name.textContent=label;
       const text=document.createElement('span');text.className='detail-value';text.textContent=value;
       cell.append(name,text);extra.append(cell);
     }
     // Match the saved-owner review's two-row details arrangement.
     extra.prepend(document.getElementById('reviewVenueRow'));
     const shell=document.querySelector('.review-shell');
     shell.dataset.concertTheme='backstage';
     const ticket=shell.querySelector('.ticket');
     const stub=shell.querySelector('.review-heading');
     ticket.querySelector('#ticketTitle').after(document.getElementById('imageWrap'));
     stub.append(document.getElementById('bookingCard'));
     const rows=document.getElementById('reviewConcertStubRows');
     rows.hidden=false;
     for(const [label,value] of [['SECTION','Stalls'],['ROW','G'],['SEAT','18'],['GATE','A2']]){
       const cell=document.createElement('div');
       const small=document.createElement('small');small.textContent=label;
       const strong=document.createElement('strong');strong.textContent=value;
       cell.append(small,strong);rows.append(cell);
     }
     document.getElementById('bookingCard').hidden=false;
     document.querySelector('#bookingCard .booking-label').textContent='QR CODE';
     document.getElementById('bookingValue').textContent='Optional booking link';
   });
   const layout=await page.evaluate(()=>{
     const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();
       return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
     return {card:rect('.review-shell'),main:rect('.review-shell>.ticket'),
       stub:rect('.review-shell>.review-heading'),
       booking:rect('.review-shell #bookingCard'),stubRows:rect('#reviewConcertStubRows')};
   });
   assert.ok(Math.abs(layout.card.width/layout.card.height-2.15)<.13,
     'Owner review must match the original ticket template ratio at any screen width');
   assert.ok(layout.main.right <= layout.stub.x+2,'Main panel must end at detachable stub');
   assert.ok(layout.stubRows.height > 0,'Stub must contain four grouped seating details');
   const print=await page.evaluate(()=>{
     const shell=document.querySelector('.review-shell');
     const sample=document.querySelector('#reviewConcertStubRows>div');
     return {border:getComputedStyle(shell,'::before').borderTopWidth,
       inset:getComputedStyle(shell,'::before').top,
       orientation:getComputedStyle(sample).writingMode,
       rotation:getComputedStyle(sample).transform,
       background:getComputedStyle(document.querySelector('.review-shell>.ticket')).backgroundImage};
   });
   assert.ok(parseFloat(print.border)>0,'Inset printed border must be fully visible');
   assert.equal(print.orientation,'vertical-rl','Stub credentials must read at 90 degrees');
   assert.notEqual(print.rotation,'none','Stub values must be rotated');
   assert.ok(print.background.includes('linear-gradient('),'Show designer event artwork, not boxed form fields');
   const stubStyle=await page.locator('.review-shell>.review-heading').evaluate(node=>({
     color:getComputedStyle(node).backgroundColor,
     printedBarcode:getComputedStyle(node.querySelector('.ct-barcode-art')).backgroundImage
   }));
   assert.notEqual(stubStyle.color,'rgba(0, 0, 0, 0)','Stub should have its own contrasting printed background');
   assert.match(stubStyle.printedBarcode,/repeating-linear-gradient/,
     'The reference-style printed barcode strip must exist as an actual decorative element');
   assert.ok(layout.booking.bottom <= layout.card.bottom+1,'QR/link must not expand the ticket');
   assert.ok(layout.card.height < (size.name==='desktop'?570:230),
     'Concert owner review must not expand vertically like the former poster');
   if(size.name==='desktop'){
     const bottomSpace=await page.locator('.review-shell').evaluate(frame=>{
       const last=frame.querySelector('#reviewConcertExtra > div:last-child');
       return {height:frame.getBoundingClientRect().height,
         remaining:frame.getBoundingClientRect().bottom-last.getBoundingClientRect().bottom};
     });
     assert.ok(bottomSpace.remaining >= bottomSpace.height*.11,
       'Owner concert details must have space above the inset printed border: '+JSON.stringify(bottomSpace));
   }
   // Owner's static cover must use the SAVED foil. The original thumbnail's
   // gold fallback must never paint over a selected Midnight/Silver/Rose cover.
   assert.ok(source.includes('ownerFoilSurface.dataset.foil='),
     'Owner review must bind the saved foil to the thumbnail');
   const foils=new Set();
   for(const finish of ['gold','silver','midnight','rose']){
     const paint=await page.locator('.scratch-surface-thumb').evaluate((thumb,foil)=>{
       thumb.dataset.foil=foil;
       return {gradient:getComputedStyle(thumb).backgroundImage,
         opacity:getComputedStyle(thumb.querySelector('canvas')).opacity};
     },finish);
     assert.match(paint.gradient,/linear-gradient/);
     assert.equal(paint.opacity,'0','Static owner preview must show the saved full-card foil, not transparent Canvas');
     foils.add(paint.gradient);
     if(finish==='midnight')assert.match(paint.gradient,/7, 15, 40|7,15,40|#070F28/i,
       'Midnight foil must not render gold');
   }
   assert.equal(foils.size,4,'Four saved foil choices must show four different owner-review surfaces');
   await page.screenshot({path:resolve(output,size.name+'-concert-owner-review-compact.png'),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();}
});
test('paid concert QR is generated from the chosen URL but is hidden until scratching',
 {timeout:90000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/r/concert-qr',{waitUntil:'networkidle'});
   await page.locator('#card.foil-ready').waitFor();
   assert.equal(await page.locator('#card').getAttribute('data-concert-theme'),'backstage');
   const card=await page.locator('#card').boundingBox();
   assert.ok(Math.abs(card.width/card.height-2.15)<.13,'Recipient ticket must remain landscape 2.15:1');
   assert.equal(await page.locator('#concertStubFields .ticket-item').count(),4,
     'Use just four separated ticket credentials rather than six narrow vertical columns');
   assert.equal(await page.locator('#recipientConcertNumber').count(),0,
     'Legacy reference must not appear on recipient ticket');
   assert.equal(await page.locator('#concertQrRow svg').count(),1,'Generate a real local SVG QR code');
   assert.equal(await page.locator('#bookingRow:visible').count(),0,'Link mode is mutually exclusive with QR mode');
   assert.equal(await page.locator('#bookingAction:visible').count(),0);
   assert.equal(await page.locator('#concertQrRow').evaluate(e=>getComputedStyle(e).visibility),'hidden');
   assert.equal(await page.locator('#concertFullTicketButton:visible').count(),0,
     'Full-size recipient view must be inaccessible until the scratch progress threshold');
   await page.evaluate(()=>document.getElementById('concertFullTicketButton').hidden=false);
   await page.locator('#concertFullTicketButton').click();
   assert.equal(await page.locator('#concertFullTicketDialog[open]').count(),1);
   const large=await page.locator('#concertFullTicketScroll>.card').boundingBox();
   assert.ok(large.width>=800,'Once unlocked, full-size recipient ticket should be readable on mobile');
   const zoomState=await page.locator('#concertFullTicketDialog .card.concert-ticket .ticket h2')
     .evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),
       ticketVariant:document.body.dataset.ticketVariant,
       media:matchMedia('(max-width:700px)').matches,
       html:el.outerHTML.slice(0,220),
       sheets:[...document.styleSheets].map(sheet=>sheet.href).filter(Boolean)}));
   assert.ok(zoomState.font>=24,'Full-size paid ticket must enlarge text, not just the background: '+JSON.stringify(zoomState));
   assert.equal(await page.locator('#concertFullTicketScroll .ticket-underlay').count(),1);
   await page.locator('#concertCloseZoom').click();
   assert.equal(await page.locator('#concertFullTicketDialog[open]').count(),0);
   assert.equal(await page.locator('body').getAttribute('data-ticket-variant'),'concert');
   assert.equal(await page.locator('#ticketGrid').textContent().then(v=>v.includes('London, England')),true);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(output,'mobile-concert-qr-covered.png'),fullPage:true});
   await page.close();
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
test('paid recipient uses selected artwork as scratch foil while hiding surprise until scratched',
 {timeout:90000},async()=>{
 const {server,base}=await startServer();
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const paintings=new Set();
  for(const art of SCRATCH_ARTWORKS){
   await page.goto(base+'/r/artwork-'+art.id,{waitUntil:'networkidle'});
   await page.locator('#card.foil-ready').waitFor();
   assert.equal(await page.locator('#card').isVisible(),true);
   assert.equal(await page.locator('#progress').getAttribute('value'),'0');
   assert.equal((await page.locator('.eyebrow').textContent()).trim(),'A special scratch reveal');
   paintings.add(await page.locator('#foilCanvas').evaluate(canvas=>canvas.toDataURL('image/png')));
  }
  assert.equal(paintings.size,20,'The paid recipient must see each saved artwork image');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(output,'recipient-approved-artwork.png'),fullPage:true});
  await page.close();
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
