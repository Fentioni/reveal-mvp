import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {CONCERT_TICKET_TEMPLATES,CONCERT_REVEAL_THEMES,DEFAULT_CONCERT_TEMPLATE,
 DEFAULT_CONCERT_REVEAL_THEME,isConcertTemplate,isConcertRevealTheme,concertTicketPolygon,
 concertTicketClipPath} from '../public/concert-ticket-options.js';

test('four selectable concert presets are distinct, bounded and renderable as CSS clip paths',()=>{
 assert.equal(CONCERT_TICKET_TEMPLATES.length,4);
 assert.equal(new Set(CONCERT_TICKET_TEMPLATES.map(t=>t.id)).size,4);
 assert.equal(DEFAULT_CONCERT_TEMPLATE,'premium-headliner');
 assert.equal(CONCERT_TICKET_TEMPLATES.some(t=>t.id==='rock-split'),false);
 assert.equal(isConcertTemplate('rock-split'),true,'Existing tickets retain their saved layout');
 const paths=new Set();
 for(const t of CONCERT_TICKET_TEMPLATES){
  assert.equal(isConcertTemplate(t.id),true);
  const points=concertTicketPolygon(t.id);
  assert.equal(points.length,4,'New reference layouts use a clean rectangular exterior');
  for(const [x,y] of points){
   assert.ok(x>=0&&x<=1 && y>=0&&y<=1,'Normalized shape must stay inside canvas');
  }
  const css=concertTicketClipPath(t.id);
  assert.match(css,/^polygon\(/);
  paths.add(css);
 }
 assert.equal(paths.size,1,'All four selectable references have a rectangular OUTER edge; stub details differ internally');
 assert.equal(isConcertTemplate('../../hidden'),false);
 assert.equal(concertTicketClipPath('invalid'),concertTicketClipPath(DEFAULT_CONCERT_TEMPLATE));
});
test('revealed-ticket themes are independent of the four metallic foils and use real artwork assets',async()=>{
 assert.equal(CONCERT_REVEAL_THEMES.length,4);
 assert.equal(new Set(CONCERT_REVEAL_THEMES.map(t=>t.id)).size,4);
 assert.equal(DEFAULT_CONCERT_REVEAL_THEME,'classic');
 assert.equal(isConcertRevealTheme('invalid'),false);
 const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
 const sources=new Set();
 for(const theme of CONCERT_REVEAL_THEMES){
  assert.equal(isConcertRevealTheme(theme.id),true);
  const svg=await readFile(resolve(root,'public/concert-reveal-art/'+theme.id+'.svg'),'utf8');
  assert.match(svg,/<svg [^>]*viewBox="0 0 2150 1000"/);
  assert.doesNotMatch(svg,/<text\b|<script\b|(?:href|src)=[\"']https?:\/\//);
  sources.add(svg);
 }
 assert.equal(sources.size,4);
});
