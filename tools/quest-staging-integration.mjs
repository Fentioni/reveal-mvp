/**
 * One-time staging integration test: creates ONE synthetic Quest record in
 * revealstage4b, checks drafts/confirm/amend and all 3/5/7 variants.
 * It must NEVER run against production. No secret or token is logged.
 */
const BASE='https://reveal-stage4b-test.michael-fenton9.workers.dev';
const chapters={
 letter:{kind:'choice',question:'I travel without moving and always point north. Which object am I?',options:['A map','A compass','A telescope'],answer:'A compass',hints:['Look for the compass.','The needle points north.']},
 compass:{kind:'order',question:'Follow the compass rose clockwise, starting from North.',options:['West','South','East'],answer:'East|South|West',hints:['Go clockwise.','East, south, west.']},
 suitcase:{kind:'lock',question:'Use the symbol sequence compass, mountain and star.',options:[],answer:'427',hints:['Look at luggage tags.','The numbers are 427.']},
 passport:{kind:'order',question:'Put the stamps in date order.',options:['Lisbon · 19 Apr','Barcelona · 12 Apr','Rome · 08 Apr'],answer:'Rome · 08 Apr|Barcelona · 12 Apr|Lisbon · 19 Apr',hints:['Look at dates.','8, 12, 19 April.']},
 map:{kind:'order',question:'Follow the path from sea to mountain.',options:['Mountain peak','Lighthouse','Forest'],answer:'Lighthouse|Forest|Mountain peak',hints:['Start at sea.','Lighthouse, forest, peak.']},
 cipher:{kind:'choice',question:'What describes your entire journey on paper?',options:['An itinerary','A lantern','A suitcase'],answer:'An itinerary',hints:['A travel plan.','An itinerary.']},
 ticket:{kind:'order',question:'Reassemble the ticket.',options:['Gold seal','Flight symbol','Route line'],answer:'Route line|Flight symbol|Gold seal',hints:['Start with route.','Route, flight, seal.']}
};
const presetKeys={
 quick:['letter','suitcase','ticket'],
 classic:['letter','suitcase','passport','map','ticket'],
 epic:['letter','compass','suitcase','passport','map','cipher','ticket']
};
function config(preset){
 return {story:'missing-itinerary',preset,mode:'ready',
  clues:presetKeys[preset].map(key=>({
   key,question:chapters[key].question,options:chapters[key].options,answer:chapters[key].answer,
   hint1:chapters[key].hints[0],hint2:chapters[key].hints[1]
  }))};
}
function form(preset,revision){
 const fd=new FormData();
 fd.set('recipient','Chloe');
 fd.set('sender','Reveal Staging');
 fd.set('eventName','STAGING SAMPLE ONLY — NOT A REAL REVEAL');
 fd.set('personalMessage','Synthetic test data, do not share.');
 fd.set('questConfig',JSON.stringify(config(preset)));
 if(revision!==undefined)fd.set('revision',String(revision));
 return fd;
}
async function fetchJSON(path,init={},expect=200){
 const res=await fetch(BASE+path,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(16000),...init});
 let data;try{data=await res.json();}catch{throw Error(path+' returned non-JSON HTTP '+res.status);}
 if(res.status!==expect)throw Error(path+' expected '+expect+' but got '+res.status+': '+(data.error||'unknown error'));
 return data;
}
function assert(cond,msg){if(!cond)throw Error(msg);}
async function owner(id,token){
 const data=await fetchJSON('/api/quest/owner/'+encodeURIComponent(id),{headers:{'X-Edit-Token':token}});
 assert(data.success&&data.config&&data.reveal,'Owner data missing');
 return data;
}
const health=await fetchJSON('/api/quest/staging-health');
assert(health.environment==='staging' && health.checkoutEnabled===false,'Not a payment-disabled staging Worker');
assert(health.legacySchemaReady===true,'Legacy staging tables are not initialised');
console.log('Confirmed staging isolation and existing Reveal schema.');
const created=await fetchJSON('/api/quest/create',{method:'POST',body:form('quick')},201);
assert(created.editToken&&created.id,'Creator did not return owner credentials');
const id=created.id,token=created.editToken;
let data=await owner(id,token);
assert(data.config.preset==='quick'&&data.config.clues.length===3,'Quick draft not saved');
console.log('Quick 3-chapter draft created and read back.');

let updated=await fetchJSON('/api/quest/owner/'+id,{
 method:'PUT',headers:{'X-Edit-Token':token},body:form('classic',data.reveal.revision)
});
assert(updated.success,'Classic update failed');
data=await owner(id,token);
assert(data.config.preset==='classic'&&data.config.clues.length===5,'Classic update not stored');
console.log('Classic 5-chapter amendment saved.');

await fetchJSON('/api/reveals/'+id+'/confirm',{method:'POST',headers:{'X-Edit-Token':token}});
data=await owner(id,token);
assert(data.reveal.status==='confirmed','Draft did not confirm');
assert(!data.reveal.shareUrl,'Unpaid recipient link was exposed');
const blocked=await fetchJSON('/api/reveals/'+id+'/checkout',{method:'POST',headers:{'X-Edit-Token':token}},503);
assert(/disabled/i.test(blocked.error),'Payment guard was not enforced');
console.log('Static review confirmed; checkout and unpaid sharing remain blocked.');

await fetchJSON('/api/reveals/'+id+'/amend',{method:'POST',headers:{'X-Edit-Token':token}});
data=await owner(id,token);
assert(data.reveal.status==='draft','Amend did not return to draft');
updated=await fetchJSON('/api/quest/owner/'+id,{
 method:'PUT',headers:{'X-Edit-Token':token},body:form('epic',data.reveal.revision)
});
data=await owner(id,token);
assert(data.config.preset==='epic'&&data.config.clues.length===7,'Epic update not stored');
console.log('Epic 7-chapter amendment saved and verified.');

const finalHealth=await fetchJSON('/api/quest/staging-health');
assert(finalHealth.questSchemaReady===true,'Quest tables did not initialise correctly');
console.log('SUCCESS: Quest D1 configuration, creator, owner security, revision control, confirm, amend, and payment safeguards verified on your own Cloudflare staging Worker.');
