/** Export the exact paid portrait face, never the covered scratch canvas.
 * All artwork bytes are embedded locally; no third-party rendering service,
 * URL, purchaser token or personal data is sent to an external exporter.
 */
const WIDTH=1800,HEIGHT=2400;
const encode=new TextEncoder();
const ascii=s=>encode.encode(s);
const dataUrl=blob=>new Promise((resolve,reject)=>{
 const reader=new FileReader();reader.onload=()=>resolve(reader.result);
 reader.onerror=()=>reject(new Error('The ticket artwork could not be read.'));
 reader.readAsDataURL(blob);
});
function asBlob(canvas,type,quality){
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The keepsake could not be created.')),type,quality));
}
async function embedImage(element){
 const source=element.getAttribute('href')||element.getAttributeNS('http://www.w3.org/1999/xlink','href');
 if(!source)throw Error('The ticket artwork is missing.');
 if(/^data:image\/(?:png|jpeg|webp);base64,/i.test(source))return;
 const url=new URL(source,location.href);
 if(url.origin!==location.origin||url.username||url.password)throw Error('The artwork is not available for a private export.');
 const response=await fetch(url,{cache:'no-store',credentials:'same-origin',redirect:'error'});
 if(!response.ok)throw Error('The ticket artwork could not be downloaded.');
 const blob=await response.blob();
 if(!/^image\/(?:png|jpeg|webp)$/i.test(blob.type))throw Error('The ticket artwork is not a supported image.');
 element.setAttribute('href',await dataUrl(blob));
 element.removeAttributeNS('http://www.w3.org/1999/xlink','href');
}
async function canvasFromFace(face){
 if(!face||face.localName!=='svg'||!face.hasAttribute('data-post-template'))throw Error('The finished ticket is not ready.');
 if(document.fonts?.ready)await document.fonts.ready;
 const svg=face.cloneNode(true);
 svg.removeAttribute('style');
 svg.setAttribute('width',String(WIDTH));svg.setAttribute('height',String(HEIGHT));
 // Embed both the original artwork and any authenticated recipient photo.
 await Promise.all([...svg.querySelectorAll('image')].map(embedImage));
 const source=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
 const url=URL.createObjectURL(source);
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('The ticket image could not be rendered.'));img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Image export is unavailable on this device.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.drawImage(img,0,0,WIDTH,HEIGHT);
  return canvas;
 }finally{URL.revokeObjectURL(url);}
}
// A single 6 x 8 inch page (300 dpi), backed by the same full-resolution
// raster as the PNG. Write binary lengths and xref offsets in bytes, not JS
// string lengths. No additional PDF library or external dependency.
export function ticketPdf(jpeg,width=WIDTH,height=HEIGHT){
 if(!(jpeg instanceof Uint8Array)||jpeg.length<4||jpeg[0]!==255||jpeg[1]!==216)throw Error('Invalid keepsake image.');
 const pageWidth=432,pageHeight=576;
 const chunks=[],offsets=[0];let length=0;
 const push=v=>{const b=typeof v==='string'?ascii(v):v;chunks.push(b);length+=b.length;};
 const object=(n,body)=>{offsets[n]=length;push(n+' 0 obj\n'+body+'\nendobj\n');};
 push('%PDF-1.4\n');push(Uint8Array.from([37,226,227,207,211,10]));
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageWidth+' '+pageHeight+'] /Resources << /XObject << /Ticket 4 0 R >> >> /Contents 5 0 R >>');
 offsets[4]=length;push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');push(jpeg);push('\nendstream\nendobj\n');
 const commands='q\n'+pageWidth+' 0 0 '+pageHeight+' 0 0 cm\n/Ticket Do\nQ\n';
 object(5,'<< /Length '+ascii(commands).length+' >>\nstream\n'+commands+'endstream');
 const table=length;
 push('xref\n0 6\n0000000000 65535 f \n');
 for(let n=1;n<=5;n++)push(String(offsets[n]).padStart(10,'0')+' 00000 n \n');
 push('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+table+'\n%%EOF\n');
 return new Blob(chunks,{type:'application/pdf'});
}
export async function createTicketKeepsakes(face){
 const canvas=await canvasFromFace(face);
 const [png,jpeg]=await Promise.all([asBlob(canvas,'image/png'),asBlob(canvas,'image/jpeg',.96)]);
 try{return {png,pdf:ticketPdf(new Uint8Array(await jpeg.arrayBuffer()))};}
 finally{canvas.width=canvas.height=1;}
}
