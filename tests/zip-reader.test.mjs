import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {extractDnaFromZip} from '../dist/zip-reader.js';
import {parseDNA} from '../dist/dna-parser.js';

const little=(view,offset,n,size)=>size===2?view.setUint16(offset,n,true):view.setUint32(offset,n,true);
function makeZip(name,body,{method=0,descriptor=false,encrypted=false}={}){
  const nameBytes=Buffer.from(name), original=Buffer.from(body);
  const compressed=method===8?deflateRawSync(original):original;
  const flag=(descriptor?8:0)|(encrypted?1:0);
  const local=Buffer.alloc(30), l=new DataView(local.buffer,local.byteOffset,local.length);
  little(l,0,0x04034b50,4);little(l,4,20,2);little(l,6,flag,2);little(l,8,method,2);
  if(!descriptor){little(l,18,compressed.length,4);little(l,22,original.length,4)}
  little(l,26,nameBytes.length,2);
  const dd=descriptor?Buffer.alloc(16):Buffer.alloc(0);
  if(descriptor){
    const d=new DataView(dd.buffer,dd.byteOffset,dd.length);
    little(d,0,0x08074b50,4);little(d,8,compressed.length,4);little(d,12,original.length,4);
  }
  const central=Buffer.alloc(46),c=new DataView(central.buffer,central.byteOffset,central.length);
  little(c,0,0x02014b50,4);little(c,4,20,2);little(c,6,20,2);little(c,8,flag,2);little(c,10,method,2);
  little(c,20,compressed.length,4);little(c,24,original.length,4);little(c,28,nameBytes.length,2);
  const end=Buffer.alloc(22), e=new DataView(end.buffer,end.byteOffset,end.length);
  little(e,0,0x06054b50,4);little(e,8,1,2);little(e,10,1,2);
  const front=Buffer.concat([local,nameBytes,compressed,dd]);
  const directory=Buffer.concat([central,nameBytes]);
  little(e,12,directory.length,4);little(e,16,front.length,4);
  return Buffer.concat([front,directory,end]);
}
const fakeFile=buffer=>({arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)});
const raw='rsid,chromosome,position,result\nrs762551,15,74749576,CA\n';
test('ZIP: stored raw MyHeritage CSV is extracted and parsed offline',async()=>{
 const text=await extractDnaFromZip(fakeFile(makeZip('genome.csv',raw)));
 assert.equal(parseDNA(text).records.get('rs762551').genotype,'AC');
});
test('ZIP: deflate compression and data descriptor are accepted',async()=>{
 const text=await extractDnaFromZip(fakeFile(makeZip('dna-export.txt',raw,{method:8,descriptor:true})));
 assert.equal(parseDNA(text).records.size,1);
});
test('ZIP: rejected format and encrypted archive raise actionable errors',async()=>{
 await assert.rejects(()=>extractDnaFromZip(fakeFile(Buffer.from('not a zip'))),/Invalid ZIP/);
 await assert.rejects(()=>extractDnaFromZip(fakeFile(makeZip('dna.csv',raw,{encrypted:true}))),/Password-protected/);
 await assert.rejects(()=>extractDnaFromZip(fakeFile(makeZip('photo.jpg','test'))),/No DNA TXT/);
});
export {makeZip};
