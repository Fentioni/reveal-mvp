import {getPostTemplate} from './post-scratch-catalogue.js?v=layout-flow-1';
const cache=new Map();
export async function loadPublishedDesign(id,{fresh=false}={}){
 const base=getPostTemplate(id);
 if(fresh)cache.delete(id);
 if(!cache.has(id)){
  const job=(async()=>{
   const response=await fetch('/api/template-designs/'+encodeURIComponent(id),{cache:'no-store'});
   if(response.status===404&&base)return {template:base,revision:'base'};
   if(!response.ok)throw Error('Could not load the published template. Refresh and try again.');
   const data=await response.json();
   if(!data.template&&!base)throw Error('Template not found.');
   return {template:data.template||base,revision:data.revision||'base'};
  })();
  cache.set(id,job);job.catch(()=>{if(cache.get(id)===job)cache.delete(id);});
 }
 return cache.get(id);
}
