import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionLabels, classificationTone, classificationHeadline, genotypeAlleleContext, inheritanceContext, reviewLabel} from '../dist/clinvar-display.js';

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

test('neutral ClinVar headline never downgrades or mislabels source classification',()=>{
  assert.equal(classificationHeadline('Pathogenic'),'Clinical evidence available');
  assert.equal(classificationHeadline('Likely pathogenic'),'Clinical evidence available');
  assert.equal(classificationHeadline('Conflicting classifications of pathogenicity'),'Mixed research classifications');
  assert.equal(classificationHeadline('Uncertain significance'),'Clinical meaning uncertain');
  assert.equal(classificationHeadline('Benign'),'Reported as likely harmless');
});
test('CT and TC give identical per-allele counts; reference to alternate orientation still matters',()=>{
  const e={ref:'T',alt:'C'};
  const ordered=genotypeAlleleContext({genotype:'CT'},e);
  const reversed=genotypeAlleleContext({genotype:'TC'},e);
  assert.equal(ordered.alternateCopies,1);
  assert.equal(ordered.referenceCopies,1);
  assert.deepEqual(ordered,reversed);
  assert.match(ordered.copyMessage,/One copy/);
  const inverse=genotypeAlleleContext({genotype:'CT'},{ref:'C',alt:'T'});
  assert.equal(inverse.ref,'C');
  assert.equal(inverse.alt,'T');
  assert.equal(inverse.alternateCopies,1);
  assert.equal(inverse.referenceCopies,1);
  assert.notEqual(inverse.alt,ordered.alt);
});
test('reference vs alternate homozygous calls correctly count 0 or 2 alternate alleles',()=>{
  const e={ref:'T',alt:'C'};
  const ref=genotypeAlleleContext({genotype:'TT'},e);
  const alt=genotypeAlleleContext({genotype:'CC'},e);
  assert.deepEqual([ref.referenceCopies,ref.alternateCopies],[2,0]);
  assert.deepEqual([alt.referenceCopies,alt.alternateCopies],[0,2]);
  assert.match(ref.copyMessage,/No copies/);
  assert.match(alt.copyMessage,/Two copies/);
  for(const invalid of ['NN','--','00','A','TG','ID'])
    assert.equal(genotypeAlleleContext({genotype:invalid},e),null);
});
test('inheritance copy-number guidance is contextual, not a claimed diagnosis',()=>{
  assert.match(inheritanceContext('Autosomal recessive sample condition',1),/usually does not cause a recessive disorder/);
  assert.match(inheritanceContext('Autosomal recessive sample condition',2),/not a clinical diagnosis/);
  assert.match(inheritanceContext('Autosomal dominant sample condition',1),/One copy can matter/);
  assert.match(inheritanceContext('Autosomal dominant sample condition|Autosomal recessive sample condition',1),/both recessive and dominant/);
  assert.match(inheritanceContext('Unknown condition',1),/cannot be determined/);
});
