import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../dist/',import.meta.url));
let server, browser, origin;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
before(async()=>{
  server=createServer(async(req,res)=>{
    try {
      const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,'')||'index.html';
      const pathname=resolve(root,relative);
      if(!pathname.startsWith(root)){res.writeHead(403).end();return}
      const buffer=await readFile(pathname);
      res.writeHead(200,{'content-type':mime[extname(pathname)]||'text/plain'}).end(buffer);
    }catch{res.writeHead(404).end('Not found')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve))});

async function pageReady(){
  const page=await browser.newPage({acceptDownloads:true});
  await page.route('**/clinvar-evidence.json',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({generated:'2026-10-28',count:0,entries:[]})
  }));
  await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill({
    status:200,contentType:'text/plain',body:'rs762551\nrs1800562\nrs4988235\n'
  }));
  await page.goto(origin);
  await page.locator('#upload-status').waitFor();
  return page;
}
const source='# genome build 37\n# rsid\tchromosome\tposition\tgenotype\nrs762551\t15\t74749576\tCA\nrs1800562\t6\t26093141\tGG\n';

test('real browser: click styled upload card opens native chooser and reads SNPs',async()=>{
  const page=await pageReady();
  try {
    const zone=await page.locator('#drop').boundingBox();
    const x=zone.x+zone.width/2, y=zone.y+zone.height/2;
    const target=await page.evaluate(({x,y})=>{
      const el=document.elementFromPoint(x,y);
      return {tag:el?.tagName,id:el?.id,cls:el?.className,closestLabel:el?.closest('label')?.getAttribute('for'),hasInput:!!document.querySelector('#file')};
    },{x,y});
    const chooserPromise=page.waitForEvent('filechooser',{timeout:6000});
    await page.mouse.click(x,y);
    let chooser;
    try{chooser=await chooserPromise}
    catch(e){throw new Error('Click-to-upload failed. Target='+JSON.stringify(target)+'; '+e.message)}

    await chooser.setFiles({name:'synthetic-23andme.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.waitForFunction(()=>document.querySelector('#total')?.textContent==='2');
    assert.match(await page.locator('#upload-status').innerText(),/Loaded 2 markers/);
    assert.equal(await page.locator('#results').isVisible(),true);
    assert.match(await page.locator('#cards').innerText(),/Caffeine metabolism/);
    assert.match(await page.locator('#cards').innerText(),/AC genotype/);
    assert.equal(await page.locator('#file').evaluate(el=>getComputedStyle(el).opacity),'0');
  } finally {await page.close()}
});
test('real browser: MyHeritage CSV upload and genotype matching',async()=>{
  const page=await pageReady();
  try{
    await page.locator('#file').setInputFiles({name:'myheritage.csv',mimeType:'text/csv',
      buffer:Buffer.from('RSID,CHROMOSOME,POSITION,RESULT\nrs762551,15,74749576,AA\nrs4988235,2,136608646,AG\n')});
    await page.waitForFunction(()=>document.querySelector('#total')?.textContent==='2');
    assert.match(await page.locator('#cards').innerText(),/potentially faster caffeine metabolism/);
    assert.match(await page.locator('#cards').innerText(),/Adult lactose digestion/);
  }finally{await page.close()}
});
test('real browser: drag-and-drop reads file, clear wipes page data',async()=>{
  const page=await pageReady();
  try{
    await page.evaluate(content=>{
      const f=new File([content],'dragged.txt',{type:'text/plain'});
      const transfer=new DataTransfer();transfer.items.add(f);
      document.querySelector('#drop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
    },source);
    await page.waitForFunction(()=>document.querySelector('#total')?.textContent==='2');
    await page.locator('#clear').click();
    assert.equal(await page.locator('#results').isVisible(),false);
  }finally{await page.close()}
});
test('real browser: invalid upload shows a clear error rather than fake success',async()=>{
  const page=await pageReady();
  try{
    await page.locator('#file').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not a genotype file')});
    await page.locator('#error').waitFor({state:'visible'});
    assert.match(await page.locator('#upload-status').innerText(),/Unable to read/);
    assert.equal(await page.locator('#results').isVisible(),false);
  }finally{await page.close()}
});
test('real browser: fictional sample loads and CSV export requires no server upload',async()=>{
  const page=await pageReady();
  const sent=[];
  page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))sent.push(request.url())});
  try{
    await page.locator('#demo').click();
    await page.waitForFunction(()=>document.querySelector('#total')?.textContent==='4');
    const download=page.waitForEvent('download');
    await page.locator('#export').click();
    assert.equal((await download).suggestedFilename(),'snp-reader-curated-results.csv');
    assert.deepEqual(sent,[]);
  }finally{await page.close()}
});
