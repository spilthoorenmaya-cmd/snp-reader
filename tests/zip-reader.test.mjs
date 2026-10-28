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


// Deliberately corrupt a tiny synthetic ZIP to verify safe failure paths.
function patchedZip(original,mutate){
 const bytes=Buffer.from(original);
 const central=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
 const eocd=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
 assert.ok(central>=0&&eocd>=0);
 mutate(bytes,central,eocd);
 return fakeFile(bytes);
}
test('ZIP: reject a valid-length archive without a ZIP central directory',async()=>{
 await assert.rejects(()=>extractDnaFromZip(fakeFile(Buffer.alloc(64))),/Unsupported ZIP archive/);
});
test('ZIP: limit central directory file count before extracting any DNA',async()=>{
 const file=patchedZip(makeZip('dna.csv',raw),(bytes,central,end)=>bytes.writeUInt16LE(5001,end+10));
 await assert.rejects(()=>extractDnaFromZip(file),/too many files/);
});
test('ZIP: reject ZIP64 and declared uncompressed size above 120 MB',async()=>{
 const zip=makeZip('dna.csv',raw);
 for(const offset of [20,24]){
   const file=patchedZip(zip,(bytes,central)=>bytes.writeUInt32LE(0xffffffff,central+offset));
   await assert.rejects(()=>extractDnaFromZip(file),/ZIP64/);
 }
 const oversized=patchedZip(zip,(bytes,central)=>bytes.writeUInt32LE(120*1024*1024+1,central+24));
 await assert.rejects(()=>extractDnaFromZip(oversized),/too large/);
});
test('ZIP: refuse damaged and out-of-bounds local file headers',async()=>{
 const zip=makeZip('dna.csv',raw);
 const brokenSignature=patchedZip(zip,bytes=>bytes.writeUInt32LE(0,0));
 await assert.rejects(()=>extractDnaFromZip(brokenSignature),/Damaged ZIP/);
 const offsetOutside=patchedZip(zip,(bytes,central)=>bytes.writeUInt32LE(bytes.length+100,central+42));
 await assert.rejects(()=>extractDnaFromZip(offsetOutside),/Damaged ZIP/);
});
test('ZIP: reject truncated payload and unsupported compression type',async()=>{
 const zip=makeZip('dna.csv',raw);
 const tooLong=patchedZip(zip,(bytes,central)=>bytes.writeUInt32LE(bytes.length+30,central+20));
 await assert.rejects(()=>extractDnaFromZip(tooLong),/Truncated ZIP/);
 const unsupported=patchedZip(zip,(bytes,central)=>bytes.writeUInt16LE(99,central+10));
 await assert.rejects(()=>extractDnaFromZip(unsupported),/compression type not supported/);
});
test('ZIP: ignore irrelevant metadata files but do not treat them as DNA',async()=>{
 for(const name of ['__MACOSX/._dna.txt','.dna.csv','portrait.jpg']){
   const result=extractDnaFromZip(fakeFile(makeZip(name,raw)));
   await assert.rejects(()=>result,/No DNA TXT/);
 }
});
test('ZIP: invalid central directory entry fails closed without parsing bytes',async()=>{
 const file=patchedZip(makeZip('dna.csv',raw),(bytes,central)=>bytes.writeUInt32LE(0,central));
 await assert.rejects(()=>extractDnaFromZip(file),/No DNA TXT/);
});
test('ZIP: deflate without browser DecompressionStream has actionable error',async()=>{
 const native=globalThis.DecompressionStream;
 try{
   globalThis.DecompressionStream=undefined;
   await assert.rejects(
     ()=>extractDnaFromZip(fakeFile(makeZip('dna.csv',raw,{method:8}))),
     /browser cannot unpack ZIP/
   );
 }finally{globalThis.DecompressionStream=native}
});
