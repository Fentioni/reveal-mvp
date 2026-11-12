/**
 * Paid Ticket & Concert Reveal display model.
 * Only populated optional values become recipient-facing elements.
 * No placeholder strings or invented defaults may appear on the final card.
 * This module is pure so recipient behaviour can be tested independently of DOM.
 */
const value = input => typeof input === 'string' ? input.trim() : '';

function formattedDate(input) {
  const raw = value(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== raw) return raw;
  return new Intl.DateTimeFormat('en-GB',{
    day:'numeric',month:'long',year:'numeric',timeZone:'UTC'
  }).format(date);
}

function formattedTime(input) {
  const raw = value(input);
  const parsed = /^(\d\d):([0-5]\d)$/.exec(raw);
  if (!parsed || Number(parsed[1]) > 23) return raw;
  const hours=Number(parsed[1]);
  return (hours % 12 || 12) + ':' + parsed[2] + (hours < 12 ? ' am' : ' pm');
}

function safeBookingUrl(input) {
  const raw = value(input);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : '';
  } catch { return ''; }
}

export function recipientCardModel(reveal={}) {
  const recipient=value(reveal.recipient);
  const sender=value(reveal.sender);
  const eventName=value(reveal.eventName);
  const message=value(reveal.personalMessage);
  const ticketUrl=safeBookingUrl(reveal.ticketUrl);
  const candidates=[
    {id:'date',label:'DATE',value:formattedDate(reveal.eventDate)},
    {id:'time',label:'TIME',value:formattedTime(reveal.eventTime)},
    {id:'venue',label:'VENUE',value:value(reveal.venue)},
    {id:'admit',label:'ADMIT',value:value(reveal.admit)}
  ];
  return {
    recipient,sender,eventName,message,ticketUrl,
    hasEventImage:reveal.hasEventImage === true,
    details:candidates.filter(item=>item.value !== '')
  };
}
