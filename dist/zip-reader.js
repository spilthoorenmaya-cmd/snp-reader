// ZIP extraction for common consumer DNA exports. No network or third-party libraries.
export async function extractDnaFromZip(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<22)throw Error('Invalid ZIP archive. Please extract the TXT or CSV and try again.');
  // ZIP central directory works even when local file headers use a data descriptor.
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}
  }
  if(eocd<0)throw Error('Unsupported ZIP archive. Extract the raw DNA file and upload the TXT or CSV.');
  let count=dv.getUint16(eocd+10,true),cursor=dv.getUint32(eocd+16,true);
  if(count>5000)throw Error('ZIP contains too many files. Extract the DNA text file first.');
  for(let i=0;i<count;i++){
    if(cursor+46>bytes.length||dv.getUint32(cursor,true)!==0x02014b50)break;
    const flags=dv.getUint16(cursor+8,true),method=dv.getUint16(cursor+10,true);
    const size=dv.getUint32(cursor+20,true),uncompressed=dv.getUint32(cursor+24,true);
    const nameLen=dv.getUint16(cursor+28,true),extraLen=dv.getUint16(cursor+30,true),commentLen=dv.getUint16(cursor+32,true);
    const localOffset=dv.getUint32(cursor+42,true);
    const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+nameLen));
    cursor+=46+nameLen+extraLen+commentLen;
    if(!/\.(txt|csv|tsv)$/i.test(name)||name.includes('__MACOSX')||name.startsWith('.'))continue;
    if(flags&1)throw Error('Password-protected ZIPs are not supported.');
    if(size===0xffffffff||uncompressed===0xffffffff)throw Error('ZIP64 archives must be extracted first.');
    if(uncompressed>120*1024*1024)throw Error('Uncompressed file is too large (120 MB limit).');
    if(localOffset+30>bytes.length||dv.getUint32(localOffset,true)!==0x04034b50)throw Error('Damaged ZIP file.');
    const start=localOffset+30+dv.getUint16(localOffset+26,true)+dv.getUint16(localOffset+28,true);
    if(start+size>bytes.length)throw Error('Truncated ZIP file.');
    const compressed=bytes.subarray(start,start+size);
    if(method===0)return new TextDecoder().decode(compressed);
    if(method===8){
      if(typeof DecompressionStream==='undefined')throw Error('Your browser cannot unpack ZIP files. Extract the TXT or CSV first.');
      const output=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(output).text();
    }
    throw Error('ZIP compression type not supported. Extract the raw DNA TXT/CSV first.');
  }
  throw Error('No DNA TXT, CSV or TSV found in the ZIP. Extract the archive and select the DNA text file.');
}
