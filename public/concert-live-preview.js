/**
 * Private creator-only, non-interactive preview of the paid Concert Ticket.
 * Receives current unsaved form values; never fetches protected recipient data.
 */
import {CONCERT_TICKET_FIELDS} from './concert-ticket-fields.js';
import {renderConcertReference} from './concert-reference-renderer.js?v=reference-3';
import {concertTicketClipPath,concertTemplateLayout} from './concert-ticket-options.js';
const foilNames=['gold','silver','midnight','rose'];
const safeUrl=raw=>{
 try{
  const u=new URL(raw);
  return ['http:','https:'].includes(u.protocol) && !u.username&&!u.password?u.href:'';
 }catch{return '';}
};
export function createConcertLivePreview({getVariant,getTemplate,getTheme,getImage,dateText,timeText,onModeChange=()=>{}}){
 const $=id=>document.getElementById(id);
 let mode='cover';
 function render(){
  if(getVariant()!=='concert')return;
  const frame=$('concertRevealedPreviewFrame');
  frame.dataset.concertTemplate=getTemplate();
  frame.dataset.concertLayout=concertTemplateLayout(getTemplate());
  frame.dataset.concertTheme=getTheme();
  frame.style.clipPath=concertTicketClipPath(getTemplate());
  frame.style.backgroundImage="url('/concert-reveal-art/"+getTheme()+".svg')";
  $('concertLiveEvent').textContent=$('eventName').value.trim() || 'Enter an event name';
  const detail=Object.fromEntries(CONCERT_TICKET_FIELDS.map(f=>[f.id,$(f.id).value.trim()]));
  $('concertLiveSubtitle').textContent=detail.eventSubtitle;
  $('concertLiveSubtitle').hidden=!detail.eventSubtitle;
  const mainRows=[
   ['DATE',$('eventDate').value?dateText($('eventDate').value):''],
   ['TIME',$('eventTime').value?timeText($('eventTime').value):''],
   ['VENUE',$('venue').value.trim()],
   ['ADDRESS',detail.venueAddress],['LEVEL',detail.level]
  ];
  const stubRows=[
   ['SECTION',detail.section],['ROW',detail.row],
   ['SEAT',detail.seat],['GATE',detail.gate]
  ];
  function paintRows(list,rows){
   list.replaceChildren();
   for(const [label,value] of rows){
    if(!value)continue;
    const item=document.createElement('div');
    item.dataset.concertField=label==='ADDRESS'?'venueAddress':label.toLowerCase();
    const dt=document.createElement('dt');dt.textContent=label;
    const dd=document.createElement('dd');dd.textContent=value;
    item.append(dt,dd);list.append(item);
   }
  }
  paintRows($('concertLiveFields'),mainRows);
  $('concertLiveFields').hidden=!$('concertLiveFields').childElementCount;
  paintRows($('concertLiveStubFields'),stubRows);
  $('concertLiveAdmit').textContent=$('admit').value.trim();
  $('concertLiveAdmit').hidden=!$('admit').value.trim();
  const recipient=$('recipient').value.trim(),sender=$('sender').value.trim();
  // The ticket stub gets ONE holder line, not recipient, sender and admission
  // repeated as seven narrow vertical columns. Sender stays in the message.
  const admission=$('admit').value.trim();
  $('concertLiveRecipient').textContent=recipient?'For '+recipient:'';
  $('concertLiveRecipient').hidden=!!admission || !recipient;
  $('concertLiveSender').hidden=true;
  $('concertLiveMessage').textContent=$('personalMessage').value.trim();
  $('concertLiveMessage').hidden=!$('personalMessage').value.trim();
  const qr=$('concertLiveQr'),link=$('concertLiveLink');
  qr.hidden=true;link.hidden=true;qr.replaceChildren();
  const url=safeUrl($('ticketUrl').value.trim());
  if(url){
   if($('concertLinkMode').value==='qr' && window.QRCode?.generateSVG){
    qr.append(window.QRCode.generateSVG(url,{ecclevel:'M',modulesize:3,margin:3}));
    qr.hidden=false;
   }else if($('concertLinkMode').value==='link'){
    link.textContent='Booking link';
    link.title=url;link.hidden=false;
   }
  }
  const img=$('concertLiveImage'),src=getImage()||'';
  img.hidden=!src;
  frame.dataset.hasImage=src?'true':'false';
  if(src)img.src=src;
  else img.removeAttribute('src');
  renderConcertReference(frame,{
   preset:getTemplate(), eventTitle:$('eventName').value.trim(),
   subtitle:detail.eventSubtitle,recipient,admit:admission,
   date:$('eventDate').value,time:$('eventTime').value,venue:$('venue').value.trim(),
   venueAddress:detail.venueAddress,level:detail.level,
   section:detail.section,row:detail.row,seat:detail.seat,gate:detail.gate,
   officialLink:url,imageSrc:src
  });
 }
 function setMode(next){
  mode=next==='revealed'?'revealed':'cover';
  document.body.dataset.concertPreview=mode;
  for(const tab of document.querySelectorAll('.concert-preview-tab')){
   tab.setAttribute('aria-selected',String(tab.dataset.previewMode===mode));
  }
  render();
  onModeChange(mode);
 }
 function setVariant(variant){
  const show=variant==='concert';
  $('concertPreviewTabsMobile').hidden=!show;
  $('concertPreviewTabsDesktop').hidden=!show;
  $('concertRevealedPreviewFrame').hidden=!show;
  document.body.dataset.concertPreview=show?mode:'cover';
  if(show)render();
 }
 function position(dock){
  const frame=$('concertRevealedPreviewFrame');
  if(frame.parentElement!==dock)dock.append(frame);
  render();
 }
 for(const field of CONCERT_TICKET_FIELDS){
  $(field.id).addEventListener('input',render);
  $(field.id).addEventListener('change',render);
 }
 for(const id of ['recipient','sender','eventName','eventDate','eventTime','venue','admit','personalMessage','ticketUrl']){
  $(id).addEventListener('input',render);
  $(id).addEventListener('change',render);
 }
 $('concertLinkMode').addEventListener('change',render);
 for(const tab of document.querySelectorAll('.concert-preview-tab')){
  tab.addEventListener('click',()=>{if(getVariant()==='concert')setMode(tab.dataset.previewMode);});
 }
 return {render,setMode,setVariant,position,mode:()=>mode};
}
