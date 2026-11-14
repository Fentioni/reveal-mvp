/* Reveal Quest — mobile cinematic guided adventure. Nothing in this public
   file contains a purchaser's surprise or unlocks a non-paid reveal. */
'use strict';
const $ = (sel,root=document) => root.querySelector(sel);
const make = (tag,className,text) => {const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const escapeHtml = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let QUEST = [
 {title:'The Mysterious Letter',kind:'choice',question:'I travel without moving and always point north. Which object am I?',options:['A map','A compass','A telescope'],answer:'A compass',hint1:'Look for the object that helps travellers find north.',hint2:'It has a magnetic needle.'},
 {title:'The Locked Suitcase',kind:'lock',question:'The note gives the order: compass, mountain, star. Match that order to the numbered luggage tags to open the suitcase.',options:[],answer:'427',hint1:'Inspect the luggage tags, not the travel stickers.',hint2:'The compass tag is 4, the mountain tag is 2 and the star tag is 7.'},
 {title:'The Passport Mystery',kind:'order',question:'Arrange the three stamps in chronological order, earliest first.',options:['Lisbon · 19 Apr','Barcelona · 12 Apr','Rome · 08 Apr'],answer:'Rome · 08 Apr|Barcelona · 12 Apr|Lisbon · 19 Apr',hint1:'The dates are more important than the cities.',hint2:'Start with 08 April, followed by 12 April.'},
 {title:'The Secret Map',kind:'order',question:'Follow the clues and visit the landmarks in the correct sequence.',options:['Mountain peak','Lighthouse','Forest'],answer:'Lighthouse|Forest|Mountain peak',hint1:'The sea is where your route begins.',hint2:'Start at the lighthouse, then visit the forest.'},
 {title:'The Missing Itinerary',kind:'order',question:'Reassemble the recovered ticket fragments in their proper order.',options:['Gold seal','Flight symbol','Route line'],answer:'Route line|Flight symbol|Gold seal',hint1:'The route is the beginning of this ticket.',hint2:'The flight symbol sits between the route and the gold seal.'}
];
const LIBRARY=Object.fromEntries(QUEST.map((q,i)=>{
 const key=['letter','suitcase','passport','map','ticket'][i];
 return [key,{...q,key,scene:key}];
}));
LIBRARY.compass={key:'compass',scene:'letter',title:'The Compass Rose',kind:'order',
 question:'Follow the compass rose clockwise, starting from North.',
 options:['West','South','East'],answer:'East|South|West',
 hint1:'Imagine turning clockwise from north.',hint2:'East, then south, then west.'};
LIBRARY.cipher={key:'cipher',scene:'ticket',title:'The Final Cipher',kind:'choice',
 question:'The last clue says: I take you somewhere new, yet never leave my page. What am I?',
 options:['An itinerary','A lantern','A suitcase'],answer:'An itinerary',
 hint1:'The missing object describes the journey.',hint2:'It is a written travel plan.'};
const PRESET_KEYS={
 quick:['letter','suitcase','ticket'],
 classic:['letter','suitcase','passport','map','ticket'],
 epic:['letter','compass','suitcase','passport','map','cipher','ticket']
};
let selectedPreset='classic';
function setPreset(value){
 if(!Object.hasOwn(PRESET_KEYS,value))return;
 selectedPreset=value;
 QUEST=PRESET_KEYS[value].map(key=>({...LIBRARY[key]}));
 const editors=$('#editors');
 if(editors){
  editors.replaceChildren(...QUEST.map((chapter,i)=>buildEditor(i,chapter)));
  updateEditMode();
 }
 const lengthInfo=$('#chapter-count');
 if(lengthInfo)lengthInfo.textContent=QUEST.length+' chapters · '+({quick:'3–5',classic:'5–8',epic:'10–15'}[value])+' minute target';
 const story=$('#quest-intro-copy');
 if(story)story.textContent='A connected '+QUEST.length+'-chapter cinematic adventure. Your recipient solves the mystery before unlocking their surprise.';
}
setPreset('classic');
const play=$('#play'),create=$('#create');let slug=null,stage=null,hintLevel=0,selected=[],digits=[0,0,0],sound=false,promptTimer=null,editing=null,revision=0,demoMode=false,demoClues=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function dust(){
 const root=$('#ambient');root.replaceChildren();
 if(reducedMotion)return;
 for(let i=0;i<27;i++){let p=make('i');p.style.setProperty('--x',(Math.random()*100)+'%');p.style.setProperty('--d',(8+Math.random()*13)+'s');p.style.setProperty('--delay',(-Math.random()*20)+'s');root.append(p);}
}
function soundFx(){
 if(!sound)return;
 try{const C=window.AudioContext||window.webkitAudioContext;const ctx=window._questAudio||(window._questAudio=new C());const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(523,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(880,ctx.currentTime+.28);g.gain.setValueAtTime(.001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.12,ctx.currentTime+.02);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.4);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.42);}catch{}
}
async function api(path, options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 let data;try{data=await response.json();}catch{throw Error('The service returned an unexpected response.');}
 if(!response.ok)throw Error(data.error||'Unable to continue.');
 return data;
}
function questHeader(step){
 const nav=make('div','topline');
 nav.innerHTML='<span class="brand">✦ &nbsp;REVEAL QUEST</span><div style="display:flex;gap:8px">'+(demoMode?'<button class="minibtn" id="close-demo" type="button" aria-label="Return to editor">✕</button>':'')+'<button class="minibtn" id="sound" type="button" aria-label="Toggle sound">'+(sound?'♫':'♪')+'</button></div>';
 const dots=make('div','progress');
 dots.setAttribute('aria-label','Chapter '+Math.min(stage?.total||QUEST.length,step+1)+' of '+(stage?.total||QUEST.length));
 for(let i=0;i<(stage?.total||QUEST.length);i++){const s=make('span',i<=step?'active':'');dots.append(s);}
 nav.appendChild(dots);return nav;
}
function newScene(scene,step){
 const view=make('section','quest');
 const backdrop=make('div','scene '+scene);backdrop.setAttribute('aria-hidden','true');view.append(backdrop,questHeader(step));
 view.addEventListener('click',e=>{if(e.target?.id==='close-demo'){closeDemo();}if(e.target?.id==='sound'){sound=!sound;e.target.textContent=sound?'♫':'♪';e.target.setAttribute('aria-pressed',String(sound));if(sound)soundFx();}});
 return view;
}
function setError(text){let e=$('#answer-error');if(e)e.textContent=text||'';}
function footer(card,buttons){
 const actions=make('div','actions');for(const b of buttons)actions.append(b);card.append(actions);
 const error=make('p','error');error.id='answer-error';error.setAttribute('role','status');card.append(error);
}
function btn(text,handler,kind='btn'){
 const b=make('button',kind,text);b.type='button';b.addEventListener('click',handler);return b;
}
function heading(parent,chapter,step){
 const label=make('div','eyebrow','Chapter '+(step+1)+' of '+(stage?.total||QUEST.length));parent.append(label);
 const h=make('h2','serif',chapter);h.style.margin='4px 0 6px';parent.append(h);
}
function stopPrompt(){if(promptTimer)clearTimeout(promptTimer);promptTimer=null;}
function schedulePrompt(){
 stopPrompt();promptTimer=setTimeout(()=>{const b=$('#hint-control');if(b&&hintLevel===0&&stage&&!stage.completed){b.textContent='Need a little help? Hints are available';}},45000);
}
function showIntro(){
 const scene=newScene('letter',0);const body=make('div','stage-body');
 const eyebrow=make('div','eyebrow','A MYSTERY FOR '+(stage?.recipient||'YOU').toUpperCase());const h=make('h1','serif','The Missing Itinerary');
 const orn=make('div','ornament','✦');
 const desc=make('p','stage-copy','An extraordinary journey awaits. Your itinerary has disappeared, and '+(stage?.total||QUEST.length)+' discoveries stand between you and your surprise.');
 const card=make('div','stage-card');card.innerHTML='<p>Follow the clues. Collect the evidence. Unlock the secret.</p>';
 card.append(btn(stage?.step>0?'Continue your adventure →':'Begin the adventure →',()=>renderStep(), 'btn'));
 if(demoMode)card.append(make('p','eyebrow','Sample story only · No actual surprise shown'));

 body.append(eyebrow,h,orn,desc,card);scene.append(body);play.replaceChildren(scene);$('#sound')?.setAttribute('aria-pressed',String(sound));
}
function renderStep(nextData=null){
 if(nextData)stage=nextData;
 if(!stage)return;
 if(stage.completed){showFinal(stage.final);return;}
 stopPrompt();hintLevel=0;selected=[];digits=[0,0,0];
 const sceneId=stage.scene||QUEST[stage.step]?.scene||'letter';
 const scene=newScene(sceneId,stage.step);const body=make('div','stage-body');
 heading(body,stage.chapter,stage.step);
 const hero=make('div','hero-object '+sceneId);
 hero.setAttribute('role',stage.kind==='lock'?'group':'img');
 hero.setAttribute('aria-label','Illustrated '+stage.chapter+' scene');
 body.append(hero);
 const card=make('div','stage-card');
 const p=make('p','',stage.question);card.append(p);
 if(stage.kind==='choice'){
   const choices=make('div','answer-grid');
   stage.options.forEach(opt=>choices.append(btn(opt,async()=>{setError('');await solve(opt);},'answer')));
   card.append(choices);
 }else if(stage.kind==='lock'){
   const wheels=make('div','wheels');
   for(let i=0;i<3;i++){
     const wheel=make('div','wheel');const up=btn('⌃',()=>turn(i,1),'up');up.setAttribute('aria-label','Increase digit '+(i+1));
     const out=make('output','',String(digits[i]));out.id='digit-'+i;out.setAttribute('aria-label','Digit '+(i+1));
     const down=btn('⌄',()=>turn(i,-1),'down');down.setAttribute('aria-label','Decrease digit '+(i+1));
     wheel.append(up,out,down);wheels.append(wheel);
   }
   hero.append(wheels);
   const note=make('p','stage-copy','Luggage tags: ★ Star 7  ·  ◇ Mountain 2  ·  ✧ Compass 4');
   note.style.fontSize='13px';card.append(note);
   card.append(btn('Unlock suitcase',()=>solve(digits.join(''))));
 }else if(stage.kind==='order'){
   card.append(make('p','eyebrow','Tap each item in the correct order'));
   const sequence=make('div','sequence');sequence.id='sequence';sequence.setAttribute('aria-live','polite');card.append(sequence);
   const options=make('div','sortable');options.id='sortable';
   stage.options.forEach(opt=>{const b=btn(opt,()=>toggleOption(opt,b),'option');options.append(b);});
   if(['passport','map','ticket'].includes(sceneId)){
     hero.setAttribute('role','group');hero.setAttribute('aria-label','Interactive '+stage.chapter+' scene');hero.append(options);
   } else card.append(options);
   card.append(btn('Check sequence',()=>solve(selected.join('|'))));
 }
 const helper=make('div','actions');const hintBtn=btn('✧ Need a hint?',()=>hint(),'btn secondary');hintBtn.id='hint-control';helper.append(hintBtn);
 const hintArea=make('div','');hintArea.id='hint-area';card.append(helper,hintArea);
 footer(card,[btn('Leave and resume later',()=>{location.href='/';},'btn ghost')]);
 body.append(card);scene.append(body);play.replaceChildren(scene);
 schedulePrompt();$('#sound')?.setAttribute('aria-pressed',String(sound));
}
function turn(i,delta){digits[i]=(digits[i]+delta+10)%10;const out=$('#digit-'+i);if(out)out.value=digits[i];}
function toggleOption(value,b){
 const index=selected.indexOf(value);
 if(index>=0)selected.splice(index,1);else if(selected.length<stage.options.length)selected.push(value);
 for(const c of $('#sortable').children)c.classList.toggle('selected',selected.includes(c.textContent));
 const display=$('#sequence');display.replaceChildren(...selected.map((s,i)=>make('span','',(i+1)+'. '+s)));
}
async function hint(){
 if(!stage||stage.completed)return;
 const b=$('#hint-control'),area=$('#hint-area');
 if(hintLevel<2){
   b.disabled=true;try{
     const out=demoMode?{hint:(demoClues||QUEST)[stage.step][hintLevel===0?'hint1':'hint2']}:await api('/api/quest/'+encodeURIComponent(slug)+'/hint?level='+(hintLevel+1));
     hintLevel++;
     area.replaceChildren(make('div','hint',out.hint));
     b.textContent=hintLevel===1?'Show a stronger hint':'Use assisted solution';
   }catch(e){setError(e.message);}finally{b.disabled=false;}
 }else{
   if(!confirm('Use the assisted solution and move to the next chapter?'))return;
   await solve(null,true);
 }
}
async function solve(answer,assist=false){
 if(!stage||stage.completed)return;
 setError('');
 try{
   const out=demoMode?demoAnswer(answer,assist):await api('/api/quest/'+encodeURIComponent(slug)+'/'+(assist?'assist':'answer'),{
     method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(assist?{step:stage.step,confirm:true}:{step:stage.step,answer})
   });
   if(!out.correct){setError(out.message||'Try again.');return;}
   soundFx();
   stopPrompt();
   const messages={letter:'The seal is broken',compass:'The compass reveals the route',suitcase:'The suitcase is unlocked',passport:'The passport reveals its secret',map:'The route is illuminated',cipher:'The final clue is solved',ticket:'The missing ticket is complete'};
   const icons={letter:'✉',compass:'✧',suitcase:'✦',passport:'✦',map:'✧',cipher:'✧',ticket:'✈'};
   const key=stage.key||QUEST[stage.step]?.key||stage.scene||'ticket';
   const active=play.querySelector('.quest');if(active)active.classList.add('chapter-clear');
   const overlay=make('div','success clear-'+stage.step);
   const animation=make('div','chapter-animation');
   animation.append(make('span','chapter-glyph',icons[key]||'✦'),make('span','chapter-message',messages[key]||'Chapter complete'));
   overlay.append(animation);
   document.body.append(overlay);
   const wait=reducedMotion?100:1250;
   await new Promise(resolve=>setTimeout(resolve,wait));
   overlay.remove();stage=out;renderStep();
 }catch(e){setError(e.message);}
}
function showFinal(data){
 stopPrompt();const scene=newScene('finale',5);scene.classList.add('played');const container=make('div','finale-content');
 container.append(make('div','eyebrow','THE MYSTERY IS SOLVED'),make('h1','serif','Your adventure awaits'));
 const name=make('h2','serif',data.title||'A wonderful surprise');name.style.margin='12px 0 18px';container.append(name);
 const tag=make('p','stage-copy','For '+data.recipient+' · From '+data.sender);container.append(tag);
 if(data.imageUrl){const img=make('img','final-image');img.src=data.imageUrl;img.alt='Your revealed surprise';container.append(img);}
 const details=make('div','reveal-details');
 for(const x of [data.message, data.date?('Date: '+data.date):'',data.time?('Time: '+data.time):'',data.venue?('Where: '+data.venue):'',data.admit?('For: '+data.admit):''])if(x)details.append(make('p','',x));
 if(data.ticketUrl && /^https:\/\//.test(data.ticketUrl)){const a=make('a','', 'View the details');a.href=data.ticketUrl;a.target='_blank';a.rel='noopener noreferrer';details.append(a);}
 container.append(details);
 const acts=make('div','actions');
 if(demoMode){acts.append(btn('Return to your editor',closeDemo,'btn'));container.append(acts);scene.append(container);play.replaceChildren(scene);return;}
 acts.append(btn('Replay the finale ✦',()=>{scene.classList.remove('played');void scene.offsetWidth;scene.classList.add('played');soundFx();},'btn'));
 acts.append(btn('Save keepsake image',()=>saveKeepsake(data),'btn secondary'));
 acts.append(btn('Print or save PDF',()=>window.print(),'btn secondary'));
 container.append(acts);
 scene.append(container);play.replaceChildren(scene);$('#sound')?.setAttribute('aria-pressed',String(sound));
}
function saveKeepsake(data){
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');
 const grad=c.createLinearGradient(0,0,1080,1350);grad.addColorStop(0,'#50331e');grad.addColorStop(.5,'#14100e');grad.addColorStop(1,'#28190e');
 c.fillStyle=grad;c.fillRect(0,0,1080,1350);c.strokeStyle='#e3c28b';c.lineWidth=4;c.strokeRect(48,48,984,1254);
 c.textAlign='center';c.fillStyle='#f5dca8';c.font='37px Georgia';c.fillText('REVEAL QUEST',540,210);
 c.font='40px Georgia';c.fillText('THE MYSTERY IS SOLVED',540,390);
 const lines=(data.title||'A wonderful surprise').match(/.{1,18}(?:\s|$)/g)||['A wonderful surprise'];
 c.font='bold 73px Georgia';lines.slice(0,5).forEach((t,i)=>c.fillText(t.trim(),540,550+i*90));
 c.font='38px Georgia';c.fillText('For '+(data.recipient||'you'),540,1040);c.fillText('From '+(data.sender||'someone special'),540,1110);
 const a=document.createElement('a');a.download='Reveal-Quest-Keepsake.png';a.href=canvas.toDataURL('image/png');a.click();
}

function demoAnswer(answer,assist){
 const base=(demoClues||QUEST)[stage.step];
 const correct=assist || String(answer??'').trim().toLowerCase()===base.answer.toLowerCase();
 if(!correct)return {correct:false,message:'Not quite. Try again, or use a hint.'};
 const next=stage.step+1;
 if(next>=QUEST.length)return {success:true,correct:true,completed:true,step:QUEST.length,total:QUEST.length,final:{recipient:'Chloe',sender:'Reveal',title:'Your personalised surprise will appear here after payment',message:'This is a sample quest. No purchaser details have been revealed.'}};
 const nextChapter=(demoClues||QUEST)[next];
 return {success:true,correct:true,completed:false,step:next,total:QUEST.length,chapter:nextChapter.title,key:nextChapter.key,scene:nextChapter.scene,kind:nextChapter.kind,question:nextChapter.question,options:nextChapter.options,recipient:'Chloe'};
}
function launchDemo(){
 const snapshot=readConfig();
 demoClues=snapshot.clues.map((clue,i)=>({...QUEST[i],...clue}));
 demoMode=true;create.hidden=true;play.hidden=false;
 const base=demoClues[0];stage={step:0,total:QUEST.length,chapter:base.title,key:base.key,scene:base.scene,kind:base.kind,question:base.question,options:base.options,recipient:'Chloe',completed:false};
 hintLevel=0;showIntro();
}
function closeDemo(){
 stopPrompt();demoMode=false;demoClues=null;stage=null;play.replaceChildren();play.hidden=true;create.hidden=false;
 window.scrollTo({top:0,behavior:'smooth'});
}

async function startRecipient(){
 create.hidden=true;play.hidden=false;slug=location.pathname.split('/').filter(Boolean)[1];
 play.replaceChildren(make('p','stage-copy','Opening your adventure…'));
 try{stage=await api('/api/quest/'+encodeURIComponent(slug)+'/state');if(stage.completed)showFinal(stage.final);else showIntro();}
 catch(e){play.replaceChildren(make('section','stage-card','This adventure is not available. '+e.message));}
}
function field(label,name,type='text',value='',extra=''){
 const wrap=make('label','');wrap.textContent=label;
 let input=type==='textarea'?make('textarea'):make('input');
 if(type!=='textarea')input.type=type;
 input.name=name;if(type!=='file')input.value=value;
 if(extra)input.placeholder=extra;wrap.append(input);return wrap;
}
function buildEditor(i,step){
 const wrapper=make('div','stepedit');wrapper.append(make('h3','',String(i+1)+'. '+step.title));
 const extras=make('div','editor-details');extras.append(field('Question','q'+i,'textarea',step.question));
 if(step.kind==='lock')extras.append(field('Correct three-digit code','a'+i,'text',step.answer));
 else{extras.append(field('Choices or objects (one per line)','o'+i,'textarea',step.options.join('\n')));
   extras.append(field(step.kind==='order'?'Correct sequence (one per line)':'Correct answer','a'+i,'textarea',step.kind==='order'?step.answer.split('|').join('\n'):step.answer));}
 extras.append(field('Hint 1','h1'+i,'textarea',step.hint1),field('Hint 2','h2'+i,'textarea',step.hint2));
 wrapper.append(extras);return wrapper;
}
function initialCreator(){
 const template=make('div','create-inner');
 template.innerHTML='<header class="topline"><span class="brand">✦ &nbsp; REVEAL QUEST</span><a href="/" class="btn ghost">Reveal home</a></header><div class="create-intro"><div class="eyebrow">MYSTERY &amp; CLUES · TRAVEL ADVENTURE</div><h1 class="serif">The Missing Itinerary</h1><div class="ornament">✦</div><p>Build a cinematic adventure of three, five or seven chapters. Your recipient solves each clue in sequence before your surprise is revealed. The real adventure stays locked until Stripe confirms payment.</p></div>';
 const form=make('form','creator-grid');form.id='creatorForm';
 const left=make('section','panel');left.innerHTML='<h2 class="serif">Your surprise</h2><small>Only the purchaser sees these details before payment. The recipient receives one private link after you have paid.</small>';
 left.append(field('Recipient name *','recipient','text','Chloe'),field('From *','sender','text'),field('Final surprise *','eventName','text','','e.g. We are going to Rome!'),field('Date (optional)','eventDate','date'),field('Time (optional)','eventTime','time'),field('Where (optional)','venue'),field('Booking / details link (optional)','ticketUrl','url'),field('Personal message','personalMessage','textarea'),field('Optional ticket / event image','image','file'));
 const right=make('section','panel');right.innerHTML='<h2 class="serif">The adventure</h2><p id="quest-intro-copy" style="line-height:1.55">Five connected cinematic chapters: letter, suitcase, passport, map and ticket.</p>';
 const presetLabel=make('label');presetLabel.textContent='Adventure length';
 const presetSelect=make('select');presetSelect.name='preset';presetSelect.innerHTML='<option value="quick">Quick — 3 chapters</option><option value="classic" selected>Classic — 5 chapters</option><option value="epic">Epic — 7 chapters</option>';
 presetLabel.append(presetSelect);right.append(presetLabel);
 const lengthInfo=make('p','eyebrow','5 chapters · 5–8 minute target');lengthInfo.id='chapter-count';right.append(lengthInfo);
 const mode=field('Clue creation mode','mode','select');mode.querySelector('input').replaceWith(Object.assign(make('select'),{name:'mode',innerHTML:'<option value="ready">Ready-made puzzles</option><option value="adaptable">Adaptable clues</option><option value="custom">Fully custom clues</option>'}));right.append(mode);
 const preview=make('div','preview');preview.innerHTML='<div class="eyebrow">YOUR RECIPIENT WILL SEE</div><h3>The Mysterious Letter</h3><p>The letter is waiting. Discover its secret to begin the journey.</p>';
 preview.append(btn('Play the sample adventure',launchDemo,'btn secondary'));
 right.append(preview,make('p','review-note','A fixed guided sequence, optional recipient-controlled hints and an assisted solution at every stage. No forced time limit.'));
 const editors=make('div','');editors.id='editors';QUEST.forEach((s,i)=>editors.append(buildEditor(i,s)));right.append(editors);
 const submit=btn(editing?'Save changes and review':'Save and review your quest',()=>{},'btn');submit.type='submit';submit.id='saveButton';
 const status=make('p','error');status.id='createStatus';status.setAttribute('role','status');
 right.append(submit,status);
 form.append(left,right);template.append(form);create.replaceChildren(template);
 const image=$('input[name=image]',form);image.accept='image/jpeg,image/png,image/webp';
 for(const name of ['recipient','sender','eventName'])form.elements.namedItem(name).required=true;
 form.addEventListener('submit',saveCreator);
 form.addEventListener('input',()=>{if($('select[name=mode]',form).value!=='ready'){
   const question=String(form.elements.namedItem('q0')?.value||'').trim();
   const el=preview.querySelector('p'); if(el)el.textContent=question||'Your opening riddle will appear here.';
 }});
 $('select[name=mode]',form).addEventListener('change',updateEditMode);
 presetSelect.addEventListener('change',()=>setPreset(presetSelect.value));
 updateEditMode();
}
function updateEditMode(){
 const enabled=$('select[name=mode]').value!=='ready';
 $('#editors').hidden=!enabled;
 for(const input of $('#editors').querySelectorAll('textarea,input'))input.disabled=!enabled;
}
function readConfig(){
 const form=$('#creatorForm');
 const mode=$('select[name=mode]',form).value;
 const clues=QUEST.map((d,i)=>{
   if(mode==='ready')return {key:d.key,question:d.question,answer:d.answer,hint1:d.hint1,hint2:d.hint2,options:d.options};
   const val=n=>String(form.elements.namedItem(n+i)?.value||'').trim();
   return{key:d.key,question:val('q'),answer:d.kind==='order'?val('a').split(/\n/).map(x=>x.trim()).filter(Boolean).join('|'):val('a'),
     hint1:val('h1'),hint2:val('h2'),options:d.kind==='lock'?[]:val('o').split(/\n/).map(x=>x.trim()).filter(Boolean)};
 });
 return{story:'missing-itinerary',preset:selectedPreset,mode,clues};
}
async function saveCreator(e){
 e.preventDefault();const form=$('#creatorForm'),status=$('#createStatus'),button=$('#saveButton');
 status.textContent='';if(!form.reportValidity())return;
 const fields=new FormData(form);fields.delete('mode');
 const config=readConfig();fields.set('questConfig',JSON.stringify(config));
 const target=editing?('/api/quest/owner/'+encodeURIComponent(editing)):'/api/quest/create';
 if(editing)fields.set('revision',String(revision));
 button.disabled=true;button.textContent='Saving your adventure…';
 try{
   const out=await api(target,{method:editing?'PUT':'POST',headers:editing?{'X-Edit-Token':localStorage.getItem('reveal_edit_'+editing)||''}:{},body:fields});
   if(out.editToken)localStorage.setItem('reveal_edit_'+out.id,out.editToken);
   localStorage.setItem('reveal_quest_'+out.id,'1');
   location.assign(out.reviewUrl);
 }catch(error){status.textContent=error.message;button.disabled=false;button.textContent=editing?'Save changes and review':'Save and review your quest';}
}
async function loadEdit(id){
 editing=id;const tok=localStorage.getItem('reveal_edit_'+id);
 if(!tok){$('#createStatus').textContent='Your private editing key is not in this browser.';return;}
 try{
   const data=await api('/api/quest/owner/'+encodeURIComponent(id),{headers:{'X-Edit-Token':tok}});
   revision=data.reveal.revision;
   const form=$('#creatorForm');
   for(const key of ['recipient','sender','eventName','eventDate','eventTime','venue','admit','ticketUrl','personalMessage']){
     if(form.elements.namedItem(key))form.elements.namedItem(key).value=data.reveal[key]||'';
   }
   form.elements.namedItem('preset').value=data.config.preset||'classic';
   setPreset(form.elements.namedItem('preset').value);
   form.elements.namedItem('mode').value=data.config.mode;
   data.config.clues.forEach((c,i)=>{
     const put=(name,value)=>{const el=form.elements.namedItem(name+i);if(el)el.value=value;};
     put('q',c.question);put('a',c.kind==='order'?c.answer.split('|').join('\n'):c.answer);
     put('h1',c.hints[0]);put('h2',c.hints[1]);put('o',c.options.join('\n'));
   });
   $('#saveButton').textContent='Save changes and review';updateEditMode();
 }catch(error){$('#createStatus').textContent=error.message;}
}
dust();
if(/^\/r\/[A-Za-z0-9_-]+\/?$/.test(location.pathname)){startRecipient();}
else{create.hidden=false;play.hidden=true;initialCreator();const id=new URLSearchParams(location.search).get('edit');if(id&&/^[A-Za-z0-9_-]+$/.test(id))loadEdit(id);}
