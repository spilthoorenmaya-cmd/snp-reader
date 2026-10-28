import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('upload uses native full-card HTML label for click-to-select',()=>{
  const js=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
  assert.match(js,/picker\.addEventListener\('change'/);
  assert.doesNotMatch(js,/\$\('file'\)\.click\(\)/);
  assert.match(html,/<label for="file" class="upload-target">/);
  assert.match(html,/<input id="file" type="file"/);
  assert.match(css,/\.upload-target\{display:block;min-height:320px/);
  assert.match(css,/\.dna-file-input\{position:absolute;left:1px;top:1px;width:1px;height:1px;opacity:0/);
});
test('upload stays local; feedback, error, and demo controls exist',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.match(html,/id="upload-status"/);
  assert.match(html,/id="demo"/);
  assert.match(html,/id="error"/);
});
