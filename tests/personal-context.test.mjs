import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePersonalContext,hasPersonalContext,personalContextSummary,
  conditionContextNote,contextAncestryOptions,contextSexOptions
} from '../dist/personal-context.js';

test('optional context defaults to empty; no age or background inferred',()=>{
  assert.deepEqual(normalizePersonalContext({}),{age:null,sex:'',ancestry:''});
  assert.equal(hasPersonalContext({}),false);
  assert.match(personalContextSummary({}),/No personal context selected/);
  assert.equal(conditionContextNote('Breast-ovarian cancer',{}),'');
});
test('only valid age, sex, ancestry selections are accepted',()=>{
  assert.deepEqual(normalizePersonalContext({age:'35',sex:'female',ancestry:'european'}),
    {age:35,sex:'female',ancestry:'european'});
  for(const age of ['-1','abc','121','1.2','10e3','9999']){
    assert.equal(normalizePersonalContext({age}).age,null,'invalid age '+age);
  }
  assert.equal(normalizePersonalContext({sex:'not-an-option',ancestry:'fake'}).sex,'');
  assert.equal(normalizePersonalContext({sex:'not-an-option',ancestry:'fake'}).ancestry,'');
  assert.ok(Object.hasOwn(contextSexOptions,'intersex'));
  assert.ok(Object.hasOwn(contextAncestryOptions,'multiple'));
});
test('selected context is shown only when provided and labelled self-reported',()=>{
  const result=personalContextSummary({age:'35',sex:'female',ancestry:'multiple'});
  assert.match(result,/Age: 35/);
  assert.match(result,/Sex assigned at birth: Female at birth/);
  assert.match(result,/Self-described ancestry: Multiple \/ mixed backgrounds/);
  assert.equal(hasPersonalContext({sex:'undisclosed',ancestry:'undisclosed'}),false);
  assert.equal(personalContextSummary({age:''}).includes('Age'),false);
});
test('cancer-related context is educational, never a percent or personal risk claim',()=>{
  const one=conditionContextNote('Breast-ovarian cancer, familial, susceptibility to, 2',
    {age:'35',sex:'female',ancestry:'european'});
  assert.match(one,/Age matters for population cancer rates/);
  assert.match(one,/Sex-related anatomy, hormones/);
  assert.match(one,/Genetic studies may have unequal representation/);
  assert.match(one,/not used to calculate a risk score/);
  assert.doesNotMatch(one,/\d+%|you have cancer|average risk|increased risk/i);
});
test('non-cancer context does not create sex-specific biological predictions',()=>{
  const note=conditionContextNote(['Autosomal recessive nonsyndromic hearing loss'],
    {age:'40',sex:'male',ancestry:'african'});
  assert.match(note,/does not change the DNA variant call/);
  assert.match(note,/does not change variant classification/);
  assert.match(note,/not a genetic-ancestry measurement/);
  assert.doesNotMatch(note,/\d+%|you are affected/i);
});
test('unknown and prefer-not-to-say fields create no context-specific note',()=>{
  assert.equal(conditionContextNote('Breast cancer',{sex:'undisclosed',ancestry:'undisclosed'}),'');
  assert.equal(conditionContextNote('Breast cancer',{age:'9999',sex:'bogus'}),'');
});
