import test from 'node:test';
import assert from 'node:assert/strict';
import {extraCatalog} from '../dist/extra-catalog.js';

test('11 added entries have distinct supported rsIDs and sources',()=>{
  assert.equal(extraCatalog.length,11);
  assert.equal(new Set(extraCatalog.map(x=>x.id)).size,11);
  for(const x of extraCatalog){
    assert.match(x.id,/^rs\d+$/);
    assert.match(x.source,/^https:\/\//);
    assert.equal(x.alleles.length,2);
    assert.equal(typeof x.interpret,'function');
  }
});

test('risk-associated alleles are not reversed',()=>{
  const byId=id=>extraCatalog.find(x=>x.id===id);
  assert.match(byId('rs1801133').interpret('AA'),/reduced enzyme/);
  assert.match(byId('rs1801133').interpret('GG'),/does not have/);
  assert.match(byId('rs9939609').interpret('AA'),/A allele/);
  assert.match(byId('rs9939609').interpret('TT'),/TT lacks/);
  assert.match(byId('rs6025').interpret('AA'),/A allele/);
  assert.match(byId('rs6025').interpret('GG'),/GG does not/);
  assert.match(byId('rs1799963').interpret('AA'),/A allele/);
  assert.match(byId('rs1799963').interpret('GG'),/GG does not/);
});
