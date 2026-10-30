import test from 'node:test';
import assert from 'node:assert/strict';
import {isNeurodevelopmentStudy,neurodevelopmentMatches,populationReferenceMatches,ensemblVariantUrl} from '../dist/research-references.js';

const records=new Map([['rs12',{genotype:'AG'}],['rs13',{genotype:'CC'}]]);
const entries=[
 {rsid:'rs12',trait:'Autism spectrum disorder',effectAllele:'A',pubmed:'123'},
 {rsid:'rs12',trait:'Attention deficit hyperactivity disorder symptoms',effectAllele:'G',pubmed:'234'},
 {rsid:'rs12',trait:'Autism spectrum disorder',effectAllele:'C',pubmed:'345'},
 {rsid:'rs13',trait:'ADHD',effectAllele:'',pubmed:'456'},
 {rsid:'rs12',trait:'Autism and schizophrenia (combined)',effectAllele:'A',pubmed:'567'},
 {rsid:'rs12',trait:'Height',effectAllele:'A',pubmed:'678'},
];

test('neurodevelopment references require a study allele present in the call',()=>{
 assert.deepEqual(neurodevelopmentMatches(records,entries).map(x=>x.pubmed),['123','234']);
 assert.equal(isNeurodevelopmentStudy({trait:'Schizophrenia vs autism spectrum disorder'}),false);
 assert.equal(isNeurodevelopmentStudy({trait:'Autism spectrum disorder, ADHD, schizophrenia (combined)'}),false);
});
test('population reference links deduplicate only matched public allele markers',()=>{
 assert.deepEqual(populationReferenceMatches(records,entries).map(x=>[x.rsid,x.allele]),[['rs12','A'],['rs12','G']]);
 assert.equal(ensemblVariantUrl('rs12'),'https://www.ensembl.org/Homo_sapiens/Variation/Explore?v=rs12');
 assert.equal(ensemblVariantUrl('rs12&x=1'),null);
});
