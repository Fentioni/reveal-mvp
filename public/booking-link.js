// Return a safe web address, adding HTTPS only to a recognisable bare host.
 // Empty is optional; null means invalid. Keep explicit HTTP(S), paths and query intact.
export function normalizeBookingLink(value){
 const raw=String(value??'').trim();
 if(!raw)return '';
 if(/[\s\u0000-\u001f\u007f\\]/u.test(raw))return null;
 const explicit=/^https?:\/\//i.test(raw);
 const relative=raw.startsWith('//');
 // Avoid interpreting non-web schemes, malformed schemes, or credentials as hosts.
 if(!explicit&&!relative&&/^[a-z][a-z0-9+.-]*:/i.test(raw)&&!/^[^/:?#]+\.[^/:?#]+:\d+(?:[/?#]|$)/.test(raw))return null;
 const candidate=explicit?raw:relative?'https:'+raw:'https://'+raw;
 if(candidate.length>2048||!/^https?:\/\/[^/?#]/i.test(candidate))return null;
 try{
  const url=new URL(candidate);
  if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)return null;
  if(!explicit){
   const host=url.hostname.replace(/\.$/,'');
   if(!host.includes('.')||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)))return null;
  }
  return candidate;
 }catch{return null;}
}
