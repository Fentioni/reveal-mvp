import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {recipientCardModel} from '../public/scratch-recipient-fields.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('recipient card includes every populated form field and formats date/time',()=>{
  const card=recipientCardModel({
    recipient:' Chloe ',sender:' Alex ',eventName:'The Midnight Show',
    eventDate:'2027-03-20',eventTime:'19:30',venue:'The Starlight Theatre',
    admit:'Chloe + 1',personalMessage:'This is the big surprise!',
    ticketUrl:'https://example.org/tickets/?order=hello',
    hasEventImage:true
  });
  assert.equal(card.recipient,'Chloe');
  assert.equal(card.sender,'Alex');
  assert.equal(card.eventName,'The Midnight Show');
  assert.equal(card.message,'This is the big surprise!');
  assert.equal(card.ticketUrl,'https://example.org/tickets/?order=hello');
  assert.equal(card.hasEventImage,true);
  assert.deepEqual(card.details,[
    {id:'date',label:'DATE',value:'20 March 2027'},
    {id:'time',label:'TIME',value:'7:30 pm'},
    {id:'venue',label:'VENUE',value:'The Starlight Theatre'},
    {id:'admit',label:'ADMIT',value:'Chloe + 1'}
  ]);
});

test('blank optional fields do not produce labels, placeholders or empty rows',()=>{
  const card=recipientCardModel({
    recipient:'Chloe',sender:'Alex',eventName:'The Midnight Show',
    eventDate:' ',eventTime:'',venue:null,admit:undefined,
    personalMessage:' ',ticketUrl:'',hasEventImage:false
  });
  assert.deepEqual(card.details,[]);
  assert.equal(card.message,'');
  assert.equal(card.ticketUrl,'');
  assert.equal(card.hasEventImage,false);
  assert.ok(!JSON.stringify(card).includes('To be confirmed'));
  assert.ok(!JSON.stringify(card).includes('—'));
});

test('each optional detail is independent: only filled fields appear',()=>{
  const card=recipientCardModel({
    recipient:'Chloe',sender:'Alex',eventName:'The Midnight Show',
    eventDate:'',eventTime:'09:05',venue:'  ',admit:'One guest',
    personalMessage:'Happy birthday',ticketUrl:' ',
    hasEventImage:false
  });
  assert.deepEqual(card.details.map(item=>item.id),['time','admit']);
  assert.deepEqual(card.details.map(item=>item.value),['9:05 am','One guest']);
  assert.equal(card.message,'Happy birthday');
});

test('booking links must be valid http(s), never executable or credentialed URLs',()=>{
  for(const input of ['javascript:alert(1)','data:text/html,bad','file:///etc/passwd',
                       'https://username:password@example.org/ticket','invalid']) {
    assert.equal(recipientCardModel({ticketUrl:input}).ticketUrl,'');
  }
  assert.equal(recipientCardModel({ticketUrl:'https://example.org/' }).ticketUrl,'https://example.org/');
});

test('recipient scratch document binds every optional element to the paid model',()=>{
  const html=fs.readFileSync(path.join(root,'public/recipient-scratch.html'),'utf8');
  assert.ok(html.includes('recipientCardModel(data.reveal)'));
  assert.ok(html.includes('applyDetails(model)'));
  for(const name of ['date','time','venue','admit'])
    assert.ok(html.includes('id="'+name+'Row" hidden'));
  for(const name of ['messageWrap','senderWrap','bookingRow','eventImageWrap'])
    assert.ok(html.includes('id="'+name+'"'));
  assert.ok(html.includes("$('ticketGrid').hidden = model.details.length === 0"));
  assert.ok(html.includes("$('bookingRow').hidden = !bookingLink"));
  assert.ok(html.includes("$('eventImageWrap').hidden = false"));
  assert.ok(html.includes("'/scratch-image'"));
  assert.ok(!html.includes("'To be confirmed'"));
  assert.ok(!html.includes("'A moment just for you.'"));
  assert.ok(html.includes('overflow-wrap:anywhere'));
  assert.ok(html.includes('rel="noopener noreferrer nofollow"'));
  assert.ok(html.includes('referrerpolicy="no-referrer"'));
});
