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
async function playChapter(page,title,sceneName,index,preset){
 await page.locator('.quest h2').filter({hasText:title}).waitFor({timeout:12000});
 assert.equal(await page.locator('.quest h2').innerText(),title);
 const hero=page.locator('.hero-object.'+sceneName);
 assert.equal(await hero.count(),1);
 assert.ok(await hero.evaluate((el,scene)=>getComputedStyle(el).backgroundImage.includes('/quest-assets/'+scene+'.webp'),sceneName),'Missing chapter artwork');
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
  for(const place of ['Rome · 08 Apr','Barcelona · 12 Apr','Lisbon · 19 Apr'])await page.getByRole('button',{name:place}).click();
  await page.getByRole('button',{name:'Check sequence'}).click();
 }
 if(title==='The Secret Map'){
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
