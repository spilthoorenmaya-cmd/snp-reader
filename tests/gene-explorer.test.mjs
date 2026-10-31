import test from 'node:test';
import assert from 'node:assert/strict';
import {explorableGenes} from '../dist/gene-explorer.js';

test('gene explorer only includes variants with local evidence matches',()=>{
 const curated=[{id:'rs1',gene:'MCM6 / LCT',valid:true},{id:'rs2',gene:'HFE',valid:false}];
 const clinvar=[{e:{id:'rs3',gene:'LCT'}},{e:{id:'rs3',gene:'LCT'}},{e:{id:'rs4',gene:'HFE'}}];
 assert.deepEqual(explorableGenes(curated,clinvar),[
  {gene:'LCT',markers:['rs1','rs3'],sources:['Curated','ClinVar']},
  {gene:'HFE',markers:['rs4'],sources:['ClinVar']},
  {gene:'MCM6',markers:['rs1'],sources:['Curated']},
 ]);
});
test('gene explorer discards unsafe gene names and unmatched curated markers',()=>{
 assert.deepEqual(explorableGenes([{id:'rs5',gene:'<script>',valid:true},{id:'rs6',gene:'HFE',valid:false}],[]),[]);
});
