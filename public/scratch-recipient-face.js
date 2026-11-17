/**
 * One portrait scratch-card face for the private owner review and paid
 * recipient. No network calls, edit tokens, payment or scratch state here.
 * All personal values are assigned as textContent, never HTML.
 */
import {getScratchTheme} from './scratch-themes.js';
export const FACE_MARKUP="<div id=\"underlay\" class=\"ticket-underlay\">\n      <div class=\"ticket-identity\">\n        <div class=\"label\" id=\"concertStubHeading\">ADMIT ONE</div>\n        <h2 class=\"recipient\" id=\"name\"></h2>\n        <span class=\"ct-barcode-art\" aria-hidden=\"true\"></span>\n        <dl id=\"concertStubFields\" class=\"concert-stub-fields\"></dl>\n      </div>\n      <h3 class=\"headline\" id=\"headline\">A special surprise</h3>\n      <article class=\"ticket\">\n        <div class=\"kicker\" id=\"ticketKicker\">PERSONALISED EVENT TICKET</div>\n        <h2 id=\"eventName\"></h2>\n         <p id=\"concertEventSubtitle\" class=\"concert-subtitle\" hidden></p>\n        <div id=\"eventImageWrap\" class=\"event-image-wrap\" hidden>\n          <img id=\"eventImage\" alt=\"Personal image included with this surprise\">\n        </div>\n        <dl class=\"ticket-grid field-grid\" id=\"ticketGrid\" hidden>\n          <div class=\"ticket-item\" id=\"dateRow\" hidden><dt>DATE</dt><dd id=\"date\"></dd></div>\n          <div class=\"ticket-item\" id=\"timeRow\" hidden><dt>TIME</dt><dd id=\"time\"></dd></div>\n          <div class=\"ticket-item\" id=\"venueRow\" hidden><dt>VENUE</dt><dd id=\"venue\"></dd></div>\n          <div class=\"ticket-item\" id=\"admitRow\" hidden><dt>ADMIT</dt><dd id=\"admit\"></dd></div>\n        </dl>\n        <dl class=\"booking-row\" id=\"bookingRow\" hidden>\n          <dt>OFFICIAL TICKET OR BOOKING LINK</dt>\n          <dd><a id=\"bookingUrl\" rel=\"noopener noreferrer nofollow\" referrerpolicy=\"no-referrer\"\n            target=\"_blank\"></a></dd>\n        </dl>\n      </article>\n      <div id=\"closingDetails\" hidden>\n        <div class=\"message-wrap\" id=\"messageWrap\" hidden><p class=\"message\" id=\"message\"></p></div>\n        <div class=\"sender-wrap\" id=\"senderWrap\" hidden><div class=\"label\" id=\"sender\"></div></div>\n      </div>\n    </div>";
export function mountScratchFace(card) {
 const template=document.createElement('template');
 template.innerHTML=FACE_MARKUP;
 const face=template.content.firstElementChild;
 card.prepend(face);
 return face;
}
export function fillScratchFace(root,model,{concert=false}={}) {
 const $=id=>root.getElementById(id);
 const text=(id,value)=>{$(id).textContent=value??'';};
 text('name',model.recipient);
 text('eventName',model.eventName);
 text('headline',concert?'The big night awaits!':'Your special surprise');
 text('ticketKicker',concert?'LIVE IN CONCERT':'PERSONALISED EVENT TICKET');
 for(const id of ['date','time','venue','admit']){
  const item=model.details.find(detail=>detail.id===id);
  $(id+'Row').hidden=!item;
  text(id,item?.value||'');
 }
 $('ticketGrid').hidden=model.details.length===0;
 $('messageWrap').hidden=!model.message;
 text('message',model.message);
 $('senderWrap').hidden=!model.sender;
 $('closingDetails').hidden=!model.sender&&!model.message;
 text('sender',model.sender?'With love, from '+model.sender:'');
 $('bookingRow').hidden=!model.ticketUrl;
 text('bookingUrl',model.ticketUrl);
 if(model.ticketUrl)$('bookingUrl').href=model.ticketUrl;
 else $('bookingUrl').removeAttribute('href');
}
export function setPortraitFaceTheme(card,id) {
 const theme=getScratchTheme(id);
 card.classList.add('scratch-face-themed');
 for(const [key,value] of Object.entries({
 '--scratch-bg':theme.bg,'--scratch-bg2':theme.bg2,
 '--scratch-accent':theme.accent,'--scratch-highlight':theme.highlight
 }))card.style.setProperty(key,value);
 return theme;
}
export async function setScratchFaceImage(root,src) {
 const img=root.getElementById('eventImage'),wrap=root.getElementById('eventImageWrap');
 if(!src){wrap.hidden=true;img.removeAttribute('src');return;}
 await new Promise((resolve,reject)=>{
  img.onload=resolve;
  img.onerror=()=>reject(new Error('Your surprise image could not be loaded.'));
  img.src=src;
 });
 wrap.hidden=false;
}
