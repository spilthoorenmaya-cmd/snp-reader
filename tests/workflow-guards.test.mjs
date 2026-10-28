import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflows=[
  new URL('../.github/workflows/test.yml',import.meta.url),
  new URL('../.github/workflows/deploy-pages.yml',import.meta.url)
];

test('coverage failures cannot be hidden by tee in CI or deployment checks',()=>{
  for(const path of workflows){
    const workflow=readFileSync(path,'utf8');
    assert.match(workflow,
      /set -o pipefail\s*\n\s*npm run test:coverage \| tee coverage-report\.txt/,
      'A failing coverage test must fail the whole pipeline: '+path.pathname);
  }
});

test('publishing the site depends on all parser and browser regression checks',()=>{
  const workflow=readFileSync(workflows[1],'utf8');
  assert.match(workflow,/needs: verify/);
  assert.match(workflow,/npm run test:e2e/);
  assert.match(workflow,/npm run test:coverage/);
});
