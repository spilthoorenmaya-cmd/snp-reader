import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBenignExample} from '../dist/benign-example.js';

const hit=(id,review)=>({e:{id,review,gene:'BRCA2'},call:{genotype:'CC'}});
test('one benign result shows one example and no more button',()=>{
 const item=hit('rs1','criteria provided, single submitter');
 const result=selectBenignExample([item]);
 assert.equal(result.example,item);
 assert.deepEqual(result.remaining,[]);
});
test('many benign results show one representative without discarding any data',()=>{
 const items=[
   hit('rs1','criteria provided, single submitter'),
   hit('rs2','reviewed by expert panel'),
   hit('rs3','criteria provided, multiple submitters, no conflicts'),
   hit('rs4','no assertion criteria provided')
 ];
 const result=selectBenignExample(items);
 assert.equal(result.example.e.id,'rs2');
 assert.deepEqual(result.remaining.map(x=>x.e.id),['rs1','rs3','rs4']);
 assert.equal(result.remaining.length+1,items.length);
});
test('same review priority is stable; empty input is safe',()=>{
 const a=hit('rs20','reviewed by expert panel');
 const b=hit('rs21','reviewed by expert panel');
 assert.equal(selectBenignExample([a,b]).example,a);
 assert.deepEqual(selectBenignExample([]),{example:null,remaining:[]});
});
test('review priority does not change health status or genotype',()=>{
 const items=[hit('rs3','expert panel'),hit('rs1','practice guideline')];
 const result=selectBenignExample(items);
 assert.equal(result.example.call.genotype,'CC');
 assert.equal(result.remaining[0].e.id,'rs3');
});
