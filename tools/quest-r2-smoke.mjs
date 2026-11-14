// Staging only: verify uploaded ticket imagery uses existing isolated R2 and
// cannot be accessed without the purchaser's edit token before payment.
const base='https://reveal-stage4b-test.michael-fenton9.workers.dev';
async function call(path,opts,expect){
 const response=await fetch(base+path,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(16000),...opts});
 if(response.status!==expect){
  let error='';try{error=JSON.stringify(await response.json());}catch{}
  throw Error(path+' expected '+expect+' got '+response.status+' '+error.slice(0,300));
 }
 return response;
}
const h=await (await call('/api/quest/staging-health',{},200)).json();
if(h.environment!=='staging'||h.checkoutEnabled!==false||!h.questSchemaReady)throw Error('Not a ready, non-paying Quest staging environment');
const puzzle={
 story:'missing-itinerary',preset:'quick',mode:'ready',
 clues:[
  {key:'letter',question:'Find what points north',options:['A map','A compass','A telescope'],answer:'A compass',hint1:'Magnet',hint2:'Compass'},
  {key:'suitcase',question:'Unlock the brass suitcase',options:[],answer:'427',hint1:'Tags',hint2:'427'},
  {key:'ticket',question:'Put these in order',options:['Gold seal','Flight symbol','Route line'],answer:'Route line|Flight symbol|Gold seal',hint1:'Route first',hint2:'Flight second'}
 ]
};
const form=new FormData();form.set('recipient','Chloe');form.set('sender','Reveal Staging');
form.set('eventName','STAGING IMAGE CHECK — FICTIONAL');
form.set('questConfig',JSON.stringify(puzzle));
const pixel=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='),ch=>ch.charCodeAt(0));
form.append('image',new Blob([pixel],{type:'image/png'}),'synthetic-test.png');
const create=await(await call('/api/quest/create',{method:'POST',body:form},201)).json();
if(!create.editToken||!create.id)throw Error('Created Quest lacks owner token/id');
const owner=await(await call('/api/quest/owner/'+encodeURIComponent(create.id),{headers:{'X-Edit-Token':create.editToken}},200)).json();
if(!owner.reveal.hasImage)throw Error('R2 image association missing');
const asset=await call('/api/reveals/'+encodeURIComponent(create.id)+'/image',{headers:{'X-Edit-Token':create.editToken}},200);
const bytes=new Uint8Array(await asset.arrayBuffer());
if(bytes.length!==pixel.length||bytes.slice(0,8).some((v,i)=>v!==pixel[i]))throw Error('R2 image returned incorrect bytes');
console.log('SUCCESS: synthetic Quest image saved in staging R2, private purchaser retrieval succeeded, and reveal remains unpaid.');
