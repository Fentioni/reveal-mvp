/** Concert-ticket-only optional display data.
 * Kept in reveal_configurations, never used for Stripe or public prepayment.
 */
export const CONCERT_TICKET_FIELDS = Object.freeze([
 Object.freeze({id:'eventSubtitle',label:'Event subtitle',max:120}),
 Object.freeze({id:'supportAct',label:'Special guest / support act',max:120}),
 Object.freeze({id:'venueAddress',label:'Venue address',max:220}),
 Object.freeze({id:'ticketNumber',label:'Ticket number / reference',max:80}),
 Object.freeze({id:'section',label:'Section',max:50}),
 Object.freeze({id:'level',label:'Level',max:50}),
 Object.freeze({id:'row',label:'Row',max:40}),
 Object.freeze({id:'seat',label:'Seat',max:40}),
 Object.freeze({id:'gate',label:'Gate',max:40}),
 Object.freeze({id:'ticketPrice',label:'Ticket face value',max:50})
]);
const byId=new Map(CONCERT_TICKET_FIELDS.map(field=>[field.id,field]));
/** Return only allowlisted fields; reject incorrect types and excessive lengths on save. */
export function checkConcertTicketDetails(input){
 if(input==null || typeof input!=='object' || Array.isArray(input))return null;
 const result={};
 for(const field of CONCERT_TICKET_FIELDS){
  const raw=input[field.id];
  if(raw==null){result[field.id]='';continue;}
  if(typeof raw!=='string' || raw.length>field.max)return null;
  // Preserve genuine content, never create invented values or codes.
  result[field.id]=raw.trim();
 }
 return result;
}
export function cleanConcertTicketDetails(input){
 if(input==null || typeof input!=='object' || Array.isArray(input))return {};
 const details={};
 for(const field of CONCERT_TICKET_FIELDS){
  const text=input[field.id];
  if(typeof text==='string' && text.trim())details[field.id]=text.trim().slice(0,field.max);
 }
 return details;
}
export function displayConcertTicketRows(input){
 const clean=cleanConcertTicketDetails(input);
 return CONCERT_TICKET_FIELDS.filter(field=>clean[field.id]).map(field=>({
  id:field.id,label:field.label.toUpperCase(),value:clean[field.id]
 }));
}
export function hasConcertTicketDetail(id){return byId.has(id);}
