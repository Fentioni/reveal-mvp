import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBookingLink} from '../public/booking-link.js';
test('booking links add HTTPS only when the web scheme is missing',()=>{
 for(const [raw,expected] of [
  ['www.ticketmaster.co.uk','https://www.ticketmaster.co.uk'],
  ['example.org/show?ref=1#details','https://example.org/show?ref=1#details'],
  [' example.org ','https://example.org'],
  ['example.org:8443/tickets','https://example.org:8443/tickets'],
  ['//example.org/tickets','https://example.org/tickets'],
  ['http://example.org','http://example.org'],
  ['https://example.org','https://example.org'],
  ['',''],['  ','']
 ])assert.equal(normalizeBookingLink(raw),expected,raw);
 for(const raw of ['javascript:alert(1)','data:text/html,hi','ftp://example.org','mailto:hello@example.org','https://user:pw@example.org','user@example.org','not a website','example','https:/example.org','https:///example.org','https://','example.org:bad','example.org\\path','https://example.org/\nfoo','https://example.org/'+ 'a'.repeat(2048)])assert.equal(normalizeBookingLink(raw),null,raw);
});
