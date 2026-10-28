import test from 'node:test';
import assert from 'node:assert/strict';
import {curatedMatches, matchClinvar} from '../dist/snp-matching.js';
import {parseDNA} from '../dist/dna-parser.js';
import {extraCatalog} from '../dist/extra-catalog.js';

const rec = (id='rs6025', genotype='AG', chr='1', pos='123') =>
  new Map([[id,{id,genotype,chr,pos}]]);
const cv = overrides => ({
  id:'rs6025',build:'GRCh37',chr:'1',pos:123,ref:'G',alt:'A',
  sig:'Pathogenic',review:'reviewed by expert panel',
  gene:'F5',condition:'Synthetic fixture – no health claims',variation:12345,
  ...overrides
});

test('ClinVar: only the exact SNP, assembly, coordinates and alternate allele match',()=>{
  assert.equal(matchClinvar(rec(),[cv()], '37').length,1);
  assert.equal(matchClinvar(rec(),[cv()], '38').length,0);
  assert.equal(matchClinvar(rec(),[cv({build:'GRCh38'})], '37').length,0);
  assert.equal(matchClinvar(rec(),[cv({chr:'2'})],'37').length,0);
  assert.equal(matchClinvar(rec(),[cv({pos:124})],'37').length,0);
  assert.equal(matchClinvar(rec(),[cv({id:'rs6026'})],'37').length,0);
  assert.equal(matchClinvar(rec(),[cv({ref:'C',alt:'T'})],'37').length,0);
  assert.equal(matchClinvar(rec(),[cv({ref:'A',alt:'C'})],'37').length,0);
  assert.equal(matchClinvar(rec(),[cv({ref:'A',alt:'G'})],'37').length,1);
});
test('ClinVar: noncarriers, no calls, indels and haploid calls never become findings',()=>{
  const row=cv();
  assert.equal(matchClinvar(rec('rs6025','GG'),[row],'37').length,0);
  for(const genotype of ['--','00','II','ID','DD','A','N/A']) {
    assert.equal(matchClinvar(rec('rs6025',genotype),[row],'37').length,0,genotype);
  }
  assert.equal(matchClinvar(rec(),[cv({ref:'G',alt:'GA'})],'37').length,0);
  assert.equal(matchClinvar(rec(),[cv({ref:'N',alt:'A'})],'37').length,0);
  assert.equal(matchClinvar(rec(),[cv({ref:'A',alt:'A'})],'37').length,0);
});
test('ClinVar: unknown genome build fails closed; duplicate assertions deduplicate',()=>{
  assert.equal(matchClinvar(rec(),[cv()], '').length,0);
  assert.equal(matchClinvar(rec(),[cv()], undefined).length,0);
  assert.equal(matchClinvar(rec(),[cv(),cv()],'37').length,1);
  assert.equal(matchClinvar(rec(),[cv({variation:44}),cv({variation:45})],'37').length,2);
});
test('ClinVar: conflicting duplicate DNA rows are removed before evidence matching',()=>{
  const dna=parseDNA('rs6025\t1\t123\tAG\nrs6025\t1\t123\tGG\nrs9\t3\t100\tCT');
  assert.equal(matchClinvar(dna.records,[cv()],'37').length,0);
});
test('curated: allele order is normalized and mismatched alleles are not interpreted',()=>{
  const caffeine=extraCatalog.find(x=>x.id==='rs762551');
  assert.ok(caffeine);
  const good=curatedMatches(rec('rs762551','CA','15','74749576'),[caffeine]);
  assert.equal(good.length,1);
  assert.equal(good[0].valid,true);
  assert.match(good[0].meaning,/AC genotype/);
  const wrong=curatedMatches(rec('rs762551','GT'),[caffeine]);
  assert.equal(wrong.length,1);
  assert.equal(wrong[0].valid,false);
  assert.match(wrong[0].meaning,/Unresolved/);
  assert.equal(curatedMatches(new Map(),[caffeine]).length,0);
});
test('curated: all 11 catalog entries handle both homozygotes and heterozygotes',()=>{
  for(const entry of extraCatalog){
    const [a,b]=entry.alleles;
    for(const genotype of [a+a,a+b,b+a,b+b]){
      const result=curatedMatches(rec(entry.id,genotype),[entry])[0];
      assert.equal(result.valid,true,entry.id+':'+genotype);
      assert.ok(result.meaning.length>12,entry.id);
    }
    const other='ACGT'.split('').find(x=>![a,b].includes(x));
    const bad=curatedMatches(rec(entry.id,other+other),[entry])[0];
    assert.equal(bad.valid,false,entry.id);
  }
});
test('caffeine genotype wording does not claim caffeine resistance',()=>{
  const caffeine=extraCatalog.find(x=>x.id==='rs762551');
  const fast=curatedMatches(rec('rs762551','AA'),[caffeine])[0];
  const slow=curatedMatches(rec('rs762551','CC'),[caffeine])[0];
  assert.match(fast.meaning,/potentially faster/);
  assert.match(slow.meaning,/potentially slower/);
  assert.match(fast.meaning,/does not mean you are caffeine-resistant/);
});
