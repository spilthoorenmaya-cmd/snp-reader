import test from 'node:test';
import assert from 'node:assert/strict';
import {matchGwas} from '../dist/gwas-matching.js';

test('GWAS overlaps stay research-only even with matching effect allele',()=>{
 const records=new Map([['rs12',{genotype:'AG'}]]);
 const rows=matchGwas(records,[{rsid:'rs12',trait:'Example trait',effectAllele:'A',pubmed:'123'},{rsid:'rs13',trait:'Other'}]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].alleleCopies,null);
 assert.equal(rows[0].status,'research-only');
});
test('no-call marker does not imply an effect',()=>{
 const rows=matchGwas(new Map([['rs12',{genotype:'--'}]]),[{rsid:'rs12',effectAllele:'A'}]);
 assert.equal(rows.length,0);
});
test('only explicitly reported matching alleles are displayed',()=>{
 const records=new Map([['rs12',{genotype:'AG'}],['rs13',{genotype:'CC'}]]);
 const rows=matchGwas(records,[
  {rsid:'rs12',effectAllele:'A'}, {rsid:'rs12',effectAllele:'G'},
  {rsid:'rs12',effectAllele:'C'}, {rsid:'rs12',effectAllele:''},
  {rsid:'rs12',effectAllele:'?'}, {rsid:'rs12',effectAllele:'AT'},
  {rsid:'rs13',effectAllele:'A'}
 ]);
 assert.deepEqual(rows.map(row=>row.effectAllele),['A','G']);
 assert.ok(rows.every(row=>row.alleleCopies===null));
});
