import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eyeColorOptions,herc2Marker,readEyeMarker,possibleChildMarkerGenotypes,exploreBabyEyeColor
} from '../dist/baby-eye-explorer.js';

const call=(genotype,build='37')=>new Map([['rs12913832',{
  chr:'15',pos:String(build==='37'?herc2Marker.build37:herc2Marker.build38),genotype
}]]);
test('HERC2 rs12913832 validates exact build, position, chromosome, and A/G alleles',()=>{
 assert.equal(readEyeMarker(call('GA'),'37').genotype,'AG');
 assert.equal(readEyeMarker(call('AA'),'37').genotype,'AA');
 assert.equal(readEyeMarker(call('GG','38'),'38').genotype,'GG');
 assert.equal(readEyeMarker(call('AA','38'),'37').status,'unverified');
 assert.equal(readEyeMarker(call('AT'),'37').status,'unverified');
 assert.equal(readEyeMarker(new Map([['rs12913832',{chr:'2',pos:28365618,genotype:'AG'}]]),'37').status,'unverified');
 assert.equal(readEyeMarker(call('AG'),'').status,'unverified');
 assert.equal(readEyeMarker(new Map(),'37').status,'missing');
 assert.equal(readEyeMarker(null,'37').status,'missing');
});
test('possible HERC2 child allele combinations are unphased one-marker possibilities, not eye colors',()=>{
 assert.deepEqual(possibleChildMarkerGenotypes('AA','GG'),['AG']);
 assert.deepEqual(possibleChildMarkerGenotypes('AG','AG'),['AA','AG','GG']);
 assert.deepEqual(possibleChildMarkerGenotypes('GG','GG'),['GG']);
 assert.deepEqual(possibleChildMarkerGenotypes('AA','AG'),['AA','AG']);
 assert.deepEqual(possibleChildMarkerGenotypes('AG','GG'),['AG','GG']);
 assert.deepEqual(possibleChildMarkerGenotypes('CC','GG'),[]);
 assert.deepEqual(possibleChildMarkerGenotypes('AG',''),[]);
});
test('dark brown and green-eyed parents may have a green-eyed child without a numeric prediction',()=>{
 const result=exploreBabyEyeColor({parentEye:'dark-brown',partnerEye:'green'},
   {status:'checked',genotype:'AG'});
 assert.match(result.headline,/green-eyed child is possible/);
 assert.match(result.narrative,/very dark brown/);
 assert.match(result.narrative,/green eyes/);
 assert.match(result.narrative,/many genes/);
 assert.match(result.markerText,/HERC2 rs12913832 is AG/);
 assert.match(result.inheritance,/does not tell us which HERC2 alleles/);
 assert.deepEqual(result.offspring,[]);
 assert.doesNotMatch(result.headline+' '+result.narrative,/\d+%|guaranteed|definitely/);
});
test('with a verified partner genotype show only possible child SNP alleles',()=>{
 const result=exploreBabyEyeColor({parentEye:'dark-brown',partnerEye:'green',partnerMarker:'GG'},
   {status:'checked',genotype:'AG'});
 assert.deepEqual(result.offspring,['AG','GG']);
 assert.match(result.inheritance,/AG, GG/);
 assert.match(result.inheritance,/NOT possible eye-colour predictions or percentages/);
 assert.doesNotMatch(result.inheritance,/chance|probability of green|likely green/);
});
test('when own SNP is missing or unverified, never construct a child genotype',()=>{
 const states=[{status:'missing',genotype:null},{status:'unverified',genotype:null},null];
 for(const state of states){
  const result=exploreBabyEyeColor({parentEye:'dark-brown',partnerEye:'green',partnerMarker:'AG'},state);
  assert.deepEqual(result.offspring,[]);
  assert.match(result.inheritance,/compatible, verified genotype for you is also needed/);
 }
 assert.match(exploreBabyEyeColor({},null).headline,/Possibly/);
 assert.equal(eyeColorOptions['dark-brown'],'very dark brown');
});
test('an eye-color selection is not treated as a genetic call',()=>{
 const result=exploreBabyEyeColor({parentEye:'green',partnerEye:'blue',partnerMarker:'GG'},
   {status:'unverified',genotype:'AG'});
 assert.deepEqual(result.offspring,[]);
 assert.match(result.markerText,/could not be verified/);
 const invalid=exploreBabyEyeColor({parentEye:'invalid',partnerEye:'green',partnerMarker:'XY'},
   {status:'checked',genotype:'GG'});
 assert.equal(invalid.hasColors,false);
 assert.deepEqual(invalid.offspring,[]);
});
