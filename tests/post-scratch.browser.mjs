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
  const {SCRATCH_ARTWORKS}=await import('/scratch-artwork-catalogue.js');
  const {renderScratchOwnerPreview}=await import('/scratch-owner-preview.js');
  const {renderPostScratchFace}=await import('/post-scratch-face.js');
  const section=document.querySelector('#preview');section.style.maxWidth='490px';
  const reveal={recipient:'Chloe',sender:'Michael',eventName:'A wonderful surprise',eventDate:'2027-04-10',eventTime:'19:30',venue:'Theatre Royal',personalMessage:'Happy birthday!',ticketUrl:'https://example.org/',hasImage:true};
  const image='/post-scratch-artwork/editorial.webp';
  const issues=[];let count=0;
  for(const template of POST_TEMPLATES)for(const artwork of SCRATCH_ARTWORKS){
   const surface={style:'classic',foil:'gold',variant:'ticket',artworkId:artwork.id,postScratch:{templateId:template.id,subtitle:'Just for you',venueAddress:'London',imagePosition:'xMaxYMin',textContrast:'dark',shade:45}};
   const scratch=await renderScratchOwnerPreview(section,{reveal,surface,artwork,eventImage:image,audio:{enabled:false},hosts:{covered:document.querySelector('#covered'),revealed:document.querySelector('#revealed'),sound:document.querySelector('#sound')}});
   const a=document.querySelector('#covered').shadowRoot.querySelector('#card'),b=document.querySelector('#revealed').shadowRoot.querySelector('#card');
   for(const card of [a,b]){const r=card.getBoundingClientRect();if(Math.abs(r.width/r.height-.75)>.001)issues.push(template.id+' ratio '+r.width/r.height);if(card.dataset.textOverflow)issues.push(template.id+' overflow '+card.dataset.textOverflow);}
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
  return {count,issues};
 });
 assert.equal(report.count,300);assert.deepEqual(report.issues,[]);assert.deepEqual(errors,[]);
 await mkdir('test-output/post-scratch',{recursive:true});await page.screenshot({path:'test-output/post-scratch/matrix-'+viewport.width+'.png'});
 console.log(viewport.width+'px: all 300 combinations passed');await page.close();
 }
 // Actual creator page: all 15 options, custom controls and amend restoration.
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const surface={variant:'ticket',style:'classic',foil:'gold',artworkId:'champagne-ribbons',postScratch:{templateId:'custom-image',subtitle:'Saved subtitle',venueAddress:'Saved address',imagePosition:'xMaxYMin',textContrast:'dark',shade:45}};
 await page.addInitScript(()=>localStorage.setItem('reveal_edit_saved','owner'));
 await page.route('**/api/reveals/saved',r=>r.fulfill({json:{success:true,reveal:{id:'saved',recipient:'Chloe',sender:'Michael',eventName:'Saved surprise',hasImage:true,status:'draft',revision:1}}}));
 await page.route('**/api/reveals/saved/scratch-surface',r=>r.fulfill({json:{success:true,surface,audio:{enabled:false}}}));
 await page.route('**/api/reveals/saved/image',r=>r.fulfill({contentType:'image/webp',path:resolve(root,'post-scratch-artwork/editorial.webp')}));
 await page.goto(base+'/legacy-create.html?edit=saved');await page.locator('#reviewButton:enabled').waitFor();
 assert.equal(await page.locator('#postTemplate option').count(),15);assert.equal(await page.locator('#postTemplate').inputValue(),'custom-image');
 assert.equal(await page.locator('#postSubtitle').inputValue(),'Saved subtitle');assert.equal(await page.locator('#postVenueAddress').inputValue(),'Saved address');
 assert.equal(await page.locator('#postImagePosition').inputValue(),'xMaxYMin');assert.equal(await page.locator('#postTextContrast').inputValue(),'dark');assert.equal(await page.locator('#postShade').inputValue(),'45');
 await page.locator('#scratchActualRevealed svg[data-post-template="custom-image"]').waitFor();
 await page.screenshot({path:'test-output/post-scratch/amend-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Creator Amend restores all template fields and image appearance');
 await page.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
