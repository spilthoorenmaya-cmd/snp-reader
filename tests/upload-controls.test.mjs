import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('upload picker click cannot bubble recursively to drop zone',()=>{
  const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.match(source,/\$\('file'\)\.addEventListener\('click',e=>e\.stopPropagation\(\)\)/);
  assert.match(source,/\$\('drop'\)\.addEventListener\('click',e=>\{/);
  assert.match(source,/e\.target\.closest\('#file'\)/);
});

test('upload accepts local DNA files and demo is separately accessible',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.match(html,/id="file" type="file"/);
  assert.match(html,/id="browse"/);
  assert.match(html,/id="demo"/);
  assert.match(html,/id="error"/);
});
