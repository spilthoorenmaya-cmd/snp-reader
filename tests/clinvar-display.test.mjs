import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionLabels, classificationTone, classificationHeadline, genotypeAlleleContext, inheritanceContext, inheritanceBrief, inheritancePattern, clinicalDisplayGroup, reviewLabel} from '../dist/clinvar-display.js';

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
  assert.equal(classificationHeadline('Benign'),'Benign evidence reported');
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
  assert.match(inheritanceContext('Autosomal recessive sample condition',1),/both copies of the gene/);
  assert.match(inheritanceContext('Autosomal recessive sample condition',1),/in trans/);
  assert.match(inheritanceContext('Autosomal recessive sample condition',1),/in cis/);
  assert.match(inheritanceContext('Autosomal recessive sample condition',2),/does not establish a clinical diagnosis/);
  assert.match(inheritanceContext('Autosomal dominant sample condition',1),/One disease-associated copy can matter/);
  assert.match(inheritanceContext('Autosomal dominant sample condition|Autosomal recessive sample condition',1),/both recessive and dominant/);
  assert.match(inheritanceContext('Unknown condition',1),/cannot be determined/);
});

test('only one-copy, explicitly recessive-pattern pathogenic autosomal records are secondary',()=>{
  const e={chr:'13',sig:'Pathogenic',condition:'Autosomal recessive example condition'};
  assert.equal(clinicalDisplayGroup(e,1),'one-copy-recessive');
  assert.equal(clinicalDisplayGroup(e,2),'main');
  assert.equal(clinicalDisplayGroup({...e,sig:'Likely pathogenic'},1),'one-copy-recessive');
  assert.equal(clinicalDisplayGroup({...e,sig:'Benign'},1),'main');
  assert.equal(clinicalDisplayGroup({...e,sig:'Uncertain significance'},1),'main');
  assert.equal(clinicalDisplayGroup({...e,chr:'X'},1),'main');
  assert.equal(clinicalDisplayGroup({...e,condition:'Autosomal recessive condition|Autosomal dominant condition'},1),'main');
  assert.equal(clinicalDisplayGroup({...e,condition:'Recessive condition|X-linked condition'},1),'main');
  assert.equal(clinicalDisplayGroup({...e,condition:'Condition with no mode listed'},1),'main');
  assert.equal(clinicalDisplayGroup({...e,sig:'Conflicting classifications of pathogenicity'},1),'main');
});

test('personalized recessive copy count explains two altered gene copies, not necessarily two identical variants',()=>{
 const one=inheritanceBrief('Autosomal recessive example condition',1);
 assert.match(one.heading,/one alternate copy/);
 assert.match(one.heading,/two affected gene copies/);
 assert.match(one.detail,/different positions/);
 assert.match(one.detail,/opposite copies of the gene/);
 assert.match(one.detail,/same copy do not make two affected copies/);
 assert.match(one.detail,/cannot establish that, detect all variants, or confirm carrier status/);
 const two=inheritanceBrief('Autosomal recessive example condition',2);
 assert.match(two.heading,/two copies of this alternate allele/);
 assert.match(two.detail,/cannot establish that you have the condition/);
});
test('one alternate copy may matter with dominant but no illness is inferred',()=>{
 const x=inheritanceBrief('Autosomal dominant example condition',1);
 assert.match(x.heading,/one can matter/);
 assert.match(x.detail,/not proof of illness/);
 assert.equal(inheritancePattern('Autosomal recessive example'),'recessive');
 assert.equal(inheritancePattern('Autosomal dominant example'),'dominant');
 assert.equal(inheritancePattern('Autosomal dominant example|Autosomal recessive example'),'mixed');
 assert.equal(inheritancePattern('X-linked recessive example'),'complex');
 const mixed=inheritanceBrief('Autosomal dominant example|Autosomal recessive example',1);
 assert.match(mixed.heading,/more than one inheritance pattern/);
 assert.match(inheritanceBrief('Not specified',1).heading,/cannot tell whether you would be affected/);
});
