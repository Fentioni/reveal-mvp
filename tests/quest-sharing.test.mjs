import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/reveal.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/qr.js',import.meta.url),'utf8');

test('The QR generator is local CC0 public domain and does not call third-party QR services',()=>{
 assert.ok(source.includes('Creative Commons CC0 license'));
 assert.ok(source.includes('public domain'));
 assert.ok(html.includes('<script defer src="/qr.js"></script>'));
 assert.ok(!html.includes('api.qrserver.com'));
 const scope={};
 vm.runInNewContext(source,scope,{timeout:1000});
 assert.equal(typeof scope.QRCode?.generateSVG,'function');
 assert.equal(typeof scope.QRCode?.generatePNG,'function');
 const matrix=scope.QRCode.generate('https://reveal.example/r/abcdefghijklmnopqrst',{ecclevel:'M'});
 assert.ok(Array.isArray(matrix));
 assert.ok(matrix.length>=25);
 assert.equal(matrix.length,matrix[0].length);
 assert.ok(matrix.every(row=>row.length===matrix.length));
});

test('All requested sharing methods are inside the paid state and use neutral link-only text',()=>{
 const paid=html.indexOf('<section id="paidStage"');
 const shares=html.indexOf('<div class="share-grid"',paid);
 const end=html.indexOf('</section>',shares);
 assert.ok(paid>0 && shares>paid && end>shares);
 for(const id of ['copyButton','whatsAppShare','smsShare','emailShare','qrShare','nativeShare','qrDownload']){
  assert.ok(html.indexOf('id="'+id+'"',paid)>paid,id+' missing from paid recipient sharing');
 }
 assert.ok(html.includes('A surprise is waiting for you. Open your Reveal link:'));
 assert.ok(html.includes("configureShareOptions(shareUrl)"));
 assert.ok(html.includes("const safe=normaliseShareUrl(shareUrl)"));
 assert.ok(html.includes("window.QRCode.generateSVG(safe"));
 assert.ok(html.includes("window.QRCode.generatePNG(safe"));
 assert.ok(html.includes('navigator.share'));
 assert.ok(html.includes('qrPanel').valueOf());
});
