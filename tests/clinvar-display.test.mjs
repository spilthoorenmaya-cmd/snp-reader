import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionLabels, classificationTone, reviewLabel} from '../dist/clinvar-display.js';

test('long ClinVar condition aliases become readable distinct labels',()=>{
  const names=conditionLabels('Autosomal recessive nonsyndromic hearing loss 1A|not provided| Hearing impairment |Nonsyndromic genetic hearing loss|Autosomal recessive nonsyndromic hearing loss 1A');
  assert.deepEqual(names,[
    'Autosomal recessive nonsyndromic hearing loss 1A',
    'Hearing impairment',
    'Nonsyndromic genetic hearing loss'
  ]);
});
test('missing or malformed condition names never produce blank titles',()=>{
  assert.deepEqual(conditionLabels('Not provided| |N/A'),['Condition not specified']);
  assert.deepEqual(conditionLabels(null),['Condition not specified']);
  assert.deepEqual(conditionLabels('  Example   condition   name  | another  '),['Example condition name','another']);
});
test('classification tones and review phrases remain descriptive rather than diagnostic',()=>{
  assert.equal(classificationTone('Pathogenic'),'pathogenic');
  assert.equal(classificationTone('Likely benign'),'benign');
  assert.equal(classificationTone('Uncertain significance'),'uncertain');
  assert.equal(classificationTone('Conflicting classifications of pathogenicity'),'uncertain');
  assert.equal(reviewLabel('reviewed by expert panel'),'Reviewed by expert panel');
  assert.equal(reviewLabel('criteria provided, single submitter'),'Single submitter');
});
