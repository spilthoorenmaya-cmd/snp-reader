import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('upload surface uses native full-card file input, no synthetic click chain',()=>{
  const js=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
  assert.match(js,/picker\.addEventListener\('change'/);
  assert.doesNotMatch(js,/\$\('file'\)\.click\(\)/);
  assert.match(css,/\.dna-file-input\{position:absolute;inset:0;width:100%;height:100%;opacity:0/);
});
test('DNA file input, status, and example remain in HTML',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(html,/id="file" type="file"/);
 assert.match(html,/id="upload-status"/);
 assert.match(html,/id="demo"/);
});
