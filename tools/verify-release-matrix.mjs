// Stage 9: read-only real staging checks, isolated browser contexts.
// Never initiate payments or persist any data. Browser emulation is not
// equivalent to physical device testing; only exercise supported inputs.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,webkit,firefox,devices} from 'playwright';
const origin='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const cases=[
 ['chromium-desktop',chromium,{viewport:{width:1440,height:900}}],
 ['chromium-android',chromium,{...devices['Pixel 7']}],
 ['webkit-desktop',webkit,{viewport:{width:1280,height:800}}],
 ['webkit-small-phone',webkit,{...devices['iPhone SE'],viewport:{width:320,height:568},reducedMotion:'reduce'}],
 ['webkit-tablet',webkit,{...devices['iPad Mini']}],
 ['firefox-desktop',firefox,{viewport:{width:1280,height:800}}],
 ['firefox-narrow',firefox,{viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}]
];
await mkdir('test-output/release-matrix',{recursive:true});
for(const [name,engine,options] of cases){
 const browser=await engine.launch({headless:true});
 const page=await browser.newPage(options);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const response=await page.goto(origin+'/legacy-create?variant=ticket&release-check='+Date.now());
  assert.ok(response.ok());assert.match(await response.text(),/data-customer-design="short-labels-1"/);
  await page.locator('#reviewButton:enabled').waitFor({timeout:30000});
  const host=page.locator('#scratchActualRevealed'),field=k=>host.locator('[data-edit-field="'+k+'"]');
  await field('eventName').waitFor({state:'visible'});
  assert.equal(await page.locator('#postTemplate option').count(),18);
  const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),name+' horizontal overflow');
  await noOverflow();
  for(const [key,value] of Object.entries({eventName:'Your surprise is a theatre trip',recipient:'Customer QA',sender:'Reveal QA',eventDate:'2027-04-10',eventTime:'19:30',venue:'Theatre Royal',personalMessage:'Have a wonderful evening!',ticketUrl:'https://example.org/tickets'})){
   await field(key).focus();await field(key).fill(value);
   assert.equal(await page.locator('#'+key).inputValue(),value);
  }
  assert.match(await host.locator('[data-field="recipient"]').textContent(),/To: Customer QA/);
  assert.match(await host.locator('[data-field="senderLine"]').textContent(),/From: Reveal QA/);
  // Native picker hit area is unobstructed, including smallest viewport.
  for(const [key,zone] of [['eventDate','date'],['eventTime','time']]){
   const input=field(key);await input.scrollIntoViewIfNeeded();await input.focus();
   assert.equal(await host.locator('.customer-zone[data-zone="'+zone+'"] button').count(),0);
   assert.ok(await input.evaluate(e=>{const r=e.getBoundingClientRect();return e.getRootNode().elementFromPoint(r.right-4,r.top+r.height/2)===e;}),name+' native picker');
   assert.ok(await host.locator('.customer-picker-handles [data-zone="'+zone+'"][data-resize="1"]').isVisible());
  }
  await field('eventName').focus();
  const tools=host.locator('.customer-design-tools');
  await tools.locator('[data-style-control="align"]').selectOption('left');
  assert.equal(await field('eventName').inputValue(),'Your surprise is a theatre trip');
  await tools.getByRole('button',{name:'Done',exact:true}).click();
  await page.locator('[data-scratch-preview-mode="covered"]').click();
  assert.equal(await host.getAttribute('aria-hidden'),'true');
  const cover=page.locator('#scratchActualCovered #card');
  assert.equal(await cover.locator('#underlay').evaluate(e=>getComputedStyle(e).visibility),'hidden');
  const before=await cover.boundingBox();
  await page.locator('[data-scratch-preview-mode="revealed"]').click();
  const after=await host.locator('#card').boundingBox();
  assert.ok(Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1);
  assert.ok(Math.abs(after.width/after.height-.75)<.01);
  await noOverflow();
  await page.screenshot({path:'test-output/release-matrix/'+name+'-creator.png',fullPage:true});
  const demo=await page.goto(origin+'/scratch-demo?release-check='+Date.now());
  assert.ok(demo.ok());
  const canvas=page.locator('#scratchWindow.foil-ready #foilCanvas');
  await canvas.waitFor();await canvas.scrollIntoViewIfNeeded();
  const b=await canvas.boundingBox(),progress=page.locator('#scratchProgress');
  const initial=await canvas.evaluate(e=>e.toDataURL());
  assert.equal(await progress.evaluate(e=>e.value),0);
  if(options.hasTouch){
   // A genuine browser touch tap, not direct mutation of the scratch engine.
   await page.touchscreen.tap(b.x+b.width*.35,b.y+b.height*.35);
   assert.ok(await progress.evaluate(e=>e.value)>0,name+' touch tap did not scratch');
  }
  // Chromium additionally exercises a genuine continuous touch gesture via CDP.
  if(engine===chromium&&options.hasTouch){
   const cdp=await page.context().newCDPSession(page);
   const send=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
   await send('touchStart',b.x+b.width*.2,b.y+b.height*.2);
   for(let i=1;i<=9;i++)await send('touchMove',b.x+b.width*(.2+i*.06),b.y+b.height*.28);
   await send('touchEnd');await cdp.detach();
  }else{
   await page.mouse.move(b.x+b.width*.2,b.y+b.height*.2);await page.mouse.down();
   await page.mouse.move(b.x+b.width*.8,b.y+b.height*.4,{steps:15});await page.mouse.up();
  }
  const amount=await progress.evaluate(e=>e.value);
  assert.ok(amount>0&&amount<100);assert.notEqual(await canvas.evaluate(e=>e.toDataURL()),initial);
  // Rotate/rescale the viewport and ensure the existing scratch path survives.
  const v=page.viewportSize();
  if(!options.isMobile){await page.setViewportSize({width:v.width+40,height:v.height});await page.waitForFunction(()=>document.querySelector('#scratchProgress')?.value>0);}
  await page.locator('#replayButton').click();
  assert.equal(await progress.evaluate(e=>e.value),0);
  await noOverflow();await page.screenshot({path:'test-output/release-matrix/'+name+'-scratch.png',fullPage:true});
  assert.deepEqual(errors,[],name+' JavaScript errors');
  console.log('STAGE 9 PASS '+name);
 }finally{await browser.close();}
}
