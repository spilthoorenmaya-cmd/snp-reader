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
 assert.equal(rows[0].status,'identifier-only');
});
