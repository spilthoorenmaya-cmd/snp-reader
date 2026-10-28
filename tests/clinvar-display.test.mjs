import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionLabels, conditionBrief, classificationTone, classificationHeadline, genotypeAlleleContext, inheritanceContext, inheritanceBrief, inheritancePattern, inheritanceDisplay, alleleDoseSummary, clinicalDisplayGroup, reviewLabel} from '../dist/clinvar-display.js';

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

test('breast-ovarian susceptibility has a bounded definition without personal cancer claims',()=>{
 const result=conditionBrief('Breast-ovarian cancer, familial, susceptibility to, 2');
 assert.equal(result.specific,true);
 assert.match(result.text,/hereditary cancer susceptibility syndrome/);
 assert.match(result.text,/many variants in these genes are benign/);
 assert.doesNotMatch(result.text,/you have cancer|you have a disease/i);
});
test('unknown disease names use a safe source-linked description rather than invented symptoms',()=>{
 const result=conditionBrief('A completely unfamiliar synthetic disorder');
 assert.equal(result.specific,false);
 assert.match(result.text,/recorded alongside the variant/);
 assert.doesNotMatch(result.text,/causes|you have/i);
});
test('homozygous benign variants never become evidence of a condition',()=>{
 const call=genotypeAlleleContext({genotype:'CC'},{ref:'G',alt:'C',chr:'13'});
 assert.equal(call.zygosity,'Homozygous alternate');
 const source=alleleDoseSummary('Breast-ovarian cancer, familial, susceptibility to, 2',2,'Benign','13');
 assert.equal(source.type,'benign');
 assert.match(source.detail,/do not turn a benign variant into disease evidence/);
});

test('benign homozygous BRCA2 records get a non-alarming headline regardless of cancer name',()=>{
  const result=alleleDoseSummary('Breast-ovarian cancer, familial, susceptibility to, 2',2,'Benign','13');
  assert.equal(result.type,'benign');
  assert.match(result.heading,/Benign variant/);
  assert.match(result.heading,/not evidence of the listed disease/);
  assert.match(result.detail,/two copies of this alternate allele/);
  assert.match(result.detail,/Two copies do not turn a benign variant into disease evidence/);
  assert.match(result.detail,/does not assess the whole gene/);
});


test('brief condition explanations cover supported categories without diagnosing the reader',()=>{
 const cases=[
  ['hereditary breast and ovarian cancer','hereditary cancer susceptibility'],
  ['Autosomal recessive nonsyndromic hearing loss 1A','reduced hearing'],
  ['Cystic fibrosis','mucus production'],
  ['Hereditary hemochromatosis','excess iron'],
  ['Familial hypercholesterolemia','LDL cholesterol'],
  ['Beta thalassemia','hemoglobin'],
  ['Sickle-cell disease','red blood cells'],
  ['Long QT syndrome','heartbeat'],
  ['Hypertrophic cardiomyopathy','heart muscle'],
  ['Factor V Leiden thrombophilia','blood to form clots'],
  ['Lynch syndrome','certain cancers'],
  ['Phenylketonuria','phenylalanine']
 ];
 for(const [name,meaning] of cases){
   const result=conditionBrief(name);
   assert.equal(result.specific,true,name);
   assert.match(result.text,new RegExp(meaning,'i'),name);
   assert.doesNotMatch(result.text,/\byou have\b|\byou will\b/i,name);
 }
});

test('ClinVar review labels and classification labels use defensible fallback behavior',()=>{
 const cases=[
  ['practice guideline','Practice guideline'],
  ['criteria provided, multiple submitters, no conflicts','Multiple submitters, no conflicts'],
  ['criteria provided, single submitter','Single submitter'],
  ['not provided','not provided'],
  ['', 'Review status not provided']
 ];
 for(const [raw,expected] of cases)assert.equal(reviewLabel(raw),expected);
 assert.equal(classificationTone('Unknown classification'),'neutral');
 assert.equal(classificationTone('Uncertain significance'),'uncertain');
 assert.equal(classificationTone('Conflicting classifications of pathogenicity'),'uncertain');
 assert.equal(classificationHeadline('Unknown classification'),'Research evidence available');
 assert.equal(classificationHeadline(''), 'Research evidence available');
});

test('all inheritance visual categories retain meaningful names, not severity rankings',()=>{
 const cases=[
  ['Autosomal recessive example','recessive','Recessive pattern mentioned'],
  ['Autosomal dominant example','dominant','Dominant pattern mentioned'],
  ['Autosomal recessive example|Autosomal dominant example','review','Mixed inheritance patterns'],
  ['X-linked recessive example','review','Special inheritance mentioned'],
  ['Mitochondrial condition','review','Special inheritance mentioned'],
  ['Condition with no indicated mode','unspecified','Inheritance not specified']
 ];
 for(const [condition,tone,label] of cases){
   const result=inheritanceDisplay(condition);
   assert.equal(result.tone,tone);
   assert.equal(result.label,label);
   assert.ok(result.description.length>20);
   assert.doesNotMatch(result.label,/high risk|increased risk|diagnosis/i);
 }
});

test('inheritance brief handles both dominant gene copies and ambiguous modes conservatively',()=>{
 const dominant=inheritanceBrief('Autosomal dominant sample condition',2);
 assert.match(dominant.heading,/two alternate copies/i);
 assert.match(dominant.detail,/not proof of illness/i);
 const mixed=inheritanceBrief('Autosomal recessive|Autosomal dominant',2);
 assert.match(mixed.heading,/more than one inheritance pattern/i);
 const unknown=inheritanceBrief('Unknown condition',0);
 assert.match(unknown.heading,/Copy count alone cannot tell/i);
});

test('allele dosage branches distinguish benign, uncertain, carrier, dominant and reference calls',()=>{
 const cases=[
  {condition:'Autosomal recessive condition',copy:0,sig:'Pathogenic',chr:'13',type:'reference',text:/No alternate allele detected/},
  {condition:'Autosomal recessive condition',copy:1,sig:'Benign',chr:'13',type:'benign',text:/Benign variant/},
  {condition:'Autosomal recessive condition',copy:2,sig:'Likely benign',chr:'13',type:'benign',text:/Two copies do not turn a benign/},
  {condition:'Autosomal dominant condition',copy:1,sig:'Conflicting classifications of pathogenicity',chr:'13',type:'review',text:/unresolved/i},
  {condition:'Autosomal recessive condition',copy:2,sig:'Uncertain significance',chr:'13',type:'review',text:/unresolved/i},
  {condition:'Autosomal recessive condition',copy:1,sig:'Pathogenic',chr:'13',type:'carrier',text:/usually insufficient alone/},
  {condition:'Autosomal recessive condition',copy:2,sig:'Pathogenic',chr:'13',type:'two-copy',text:/Homozygous calls/},
  {condition:'Autosomal recessive condition',copy:2,sig:'Not provided',chr:'13',type:'two-copy',text:/does not establish that this variant causes disease/},
  {condition:'Autosomal dominant condition',copy:1,sig:'Likely pathogenic',chr:'13',type:'dominant',text:/may matter/},
  {condition:'Autosomal dominant condition',copy:2,sig:'Likely pathogenic',chr:'13',type:'dominant',text:/does not require two/},
  {condition:'Unknown condition',copy:1,sig:'Pathogenic',chr:'13',type:'review',text:/One alternate copy detected/},
  {condition:'Unknown condition',copy:2,sig:'Pathogenic',chr:'13',type:'review',text:/Two alternate copies detected/},
  {condition:'Autosomal recessive condition',copy:2,sig:'Pathogenic',chr:'X',type:'review',text:/chromosome-specific interpretation/},
  {condition:'Autosomal recessive condition',copy:1,sig:'Pathogenic',chr:'MT',type:'review',text:/sex chromosome or mitochondrial/}
 ];
 for(const c of cases){
   const result=alleleDoseSummary(c.condition,c.copy,c.sig,c.chr);
   assert.equal(result.type,c.type,JSON.stringify(c));
   assert.match(result.heading+' '+result.detail,c.text,JSON.stringify(c));
   assert.doesNotMatch(result.detail,/\byou have (?:the |a )?(?:disorder|disease|cancer)\b/i);
 }
});

test('genotype allele context validates chromosome and gene copy context',()=>{
 const e={ref:'G',alt:'A',chr:'13'};
 const zero=genotypeAlleleContext({genotype:'GG'},e);
 const one=genotypeAlleleContext({genotype:'AG'},e);
 const two=genotypeAlleleContext({genotype:'AA'},e);
 assert.equal(zero.zygosity,'Homozygous reference');
 assert.equal(one.zygosity,'Heterozygous');
 assert.equal(two.zygosity,'Homozygous alternate');
 assert.equal(zero.isAutosomal,true);
 assert.equal(genotypeAlleleContext({genotype:'AG'},{...e,chr:'X'}).isAutosomal,false);
 for(const evidence of [{ref:'G',alt:'G'},{ref:'-',alt:'A'},{ref:'G',alt:'AA'},{ref:'',alt:''}]){
   assert.equal(genotypeAlleleContext({genotype:'GA'},evidence),null);
 }
 assert.equal(genotypeAlleleContext(null,e),null);
});

test('recessive carrier tab never silently groups mixed or sex-linked interpretations',()=>{
 const base={chr:'13',sig:'Pathogenic',condition:'Autosomal recessive sample condition'};
 for(const record of [
  {...base,chr:'Y'},
  {...base,chr:'MT'},
  {...base,condition:'Autosomal recessive|Autosomal dominant'},
  {...base,condition:'Autosomal recessive|Mitochondrial'},
  {...base,sig:'Uncertain significance'},
  {...base,sig:'Benign'}
 ])assert.equal(clinicalDisplayGroup(record,1),'main',JSON.stringify(record));
 assert.equal(clinicalDisplayGroup({...base,chr:'chr13'},1),'one-copy-recessive');
});
