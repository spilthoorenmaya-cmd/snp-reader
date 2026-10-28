import test from 'node:test';
import assert from 'node:assert/strict';
import {SERPINA1_MARKERS,checkSerpina1Marker,interpretSerpina1} from '../dist/serpina1.js';

const z=SERPINA1_MARKERS.find(m=>m.id==='rs28929474');
const s=SERPINA1_MARKERS.find(m=>m.id==='rs17580');
function rec(def,gt,build='37'){
  return {id:def.id,chr:'14',pos:String(build==='37'?def.grch37:def.grch38),genotype:gt};
}
function calls({Z,S,build='37'}={}){
  const map=new Map();
  if(Z!==undefined)map.set(z.id,rec(z,Z,build));
  if(S!==undefined)map.set(s.id,rec(s,S,build));
  return map;
}
test('S and Z reference coordinates and genomic-plus-strand alleles are distinct',()=>{
  assert.deepEqual([z.ref,z.alt,z.grch37,z.grch38,z.clinvar],['C','T',94844947,94378610,17967]);
  assert.deepEqual([s.ref,s.alt,s.grch37,s.grch38,s.clinvar],['T','A',94847262,94380925,17969]);
});
test('neither tested marker means not assessed, never a negative health result',()=>{
  const result=interpretSerpina1(new Map(),'37');
  assert.equal(result.complete,false);
  assert.match(result.heading,/not fully assessed/);
  assert.ok(result.markers.every(m=>m.status==='not-tested'));
  assert.match(result.meaning,/missing or unverified call cannot be treated as a negative result/);
});
test('known GRCh37 Z genomic T and S genomic A are detected with exact positions',()=>{
  const result=interpretSerpina1(calls({Z:'CT',S:'AT'}),'37');
  assert.equal(result.complete,true);
  assert.equal(result.markers[0].alternateCopies,1);
  assert.equal(result.markers[1].alternateCopies,1);
  assert.match(result.heading,/S allele and a Z allele/);
  assert.match(result.meaning,/cannot prove the variants lie on opposite gene copies/);
});
test('known GRCh38 calls match only the exact build',()=>{
  const data=calls({Z:'TT',S:'TT',build:'38'});
  const valid=interpretSerpina1(data,'38');
  assert.equal(valid.complete,true);
  assert.equal(valid.markers[0].alternateCopies,2);
  assert.match(valid.heading,/Two Z alleles/);
  const wrongBuild=interpretSerpina1(data,'37');
  assert.equal(wrongBuild.complete,false);
  assert.ok(wrongBuild.markers.every(m=>m.status==='unverified'));
});
test('one or two S copies, one Z copy and neither variant have distinct explanations',()=>{
  assert.match(interpretSerpina1(calls({Z:'CC',S:'AT'}),'37').heading,/One S allele/);
  assert.match(interpretSerpina1(calls({Z:'CT',S:'TT'}),'37').heading,/One Z allele/);
  assert.match(interpretSerpina1(calls({Z:'CC',S:'AA'}),'37').heading,/Two S alleles/);
  const neither=interpretSerpina1(calls({Z:'CC',S:'TT'}),'37');
  assert.match(neither.heading,/Neither common S nor Z/);
  assert.match(neither.meaning,/does not exclude other SERPINA1 variants/);
});
test('one untested marker never implies a normal complete SERPINA1 result',()=>{
  const partial=interpretSerpina1(calls({Z:'CC'}),'37');
  assert.equal(partial.complete,false);
  assert.match(partial.heading,/not fully assessed/);
  assert.equal(partial.markers[1].status,'not-tested');
  const partialZ=interpretSerpina1(calls({Z:'TT'}),'37');
  assert.equal(partialZ.complete,false);
  assert.match(partialZ.heading,/Two Z alleles/);
  assert.equal(partialZ.coverage,'Incomplete marker coverage');
});
test('invalid build, no-call, wrong chromosome, coordinate and allele are rejected safely',()=>{
  assert.equal(checkSerpina1Marker(calls({Z:'CT'}),'',z).status,'unverified');
  assert.equal(checkSerpina1Marker(calls({Z:'--'}),'37',z).status,'no-call');
  assert.equal(checkSerpina1Marker(new Map([[z.id,{...rec(z,'CT'),chr:'13'}]]),'37',z).status,'unverified');
  assert.equal(checkSerpina1Marker(new Map([[z.id,{...rec(z,'CT'),pos:'9999999'}]]),'37',z).status,'unverified');
  assert.equal(checkSerpina1Marker(calls({Z:'AG'}),'37',z).status,'unverified');
  assert.equal(checkSerpina1Marker(calls({Z:'A'}),'37',z).status,'unverified');
});
test('all genotype labels are observations not diagnoses or exact percentages',()=>{
  for(const Z of ['CC','CT','TT'])for(const S of ['TT','AT','AA']){
    const report=interpretSerpina1(calls({Z,S}),'37');
    assert.doesNotMatch(report.heading,/%|you have alpha-1 deficiency/i);
    assert.doesNotMatch(report.meaning,/diagnosed|definitely have|guaranteed/i);
  }
});
