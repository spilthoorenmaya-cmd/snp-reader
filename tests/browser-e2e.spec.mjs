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

async function pageReady(entries=[]){
  const page=await browser.newPage({acceptDownloads:true});
  await page.route('**/clinvar-evidence.json',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({generated:'2026-10-28',count:entries.length,entries})
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
    await page.locator('#drop').scrollIntoViewIfNeeded();
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

test('real browser: ClinVar cards show concise condition and expandable aliases',async()=>{
  const example={
    id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,
    ref:'C',alt:'A',sig:'Pathogenic',review:'reviewed by expert panel',
    condition:'Example condition alpha|not provided|Another recorded condition name|Example condition alpha',
    variation:123456
  };
  const page=await pageReady([example]);
  try {
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('.clinvar-card').waitFor();
    const card=page.locator('.clinvar-card').first();
    assert.match(await card.locator('.clinvar-gene').innerText(),/EXAMPLE/);
    assert.equal(await card.locator('.clinvar-classification').innerText(),'Clinical evidence available');
    assert.match(await card.locator('.clinvar-allele-grid').innerText(),/Reference allele/);
    assert.match(await card.locator('.clinvar-allele-grid').innerText(),/Alternate allele/);
    assert.match(await card.locator('.clinvar-copy-context').innerText(),/One copy of the alternate allele/);
    assert.equal(await card.locator('.clinvar-allele').count(),2);
    assert.match(await card.locator('.clinvar-allele').first().innerText(),/1 copy/);
    assert.match(await card.locator('.clinvar-allele').last().innerText(),/1 copy/);
    assert.equal(await card.locator('.clinvar-allele').first().locator('a').getAttribute('href'),'https://www.ncbi.nlm.nih.gov/snp/rs762551');
    assert.equal(await card.locator('.clinvar-allele').last().locator('a').getAttribute('href'),'https://www.ncbi.nlm.nih.gov/clinvar/variation/123456/');
    await card.locator('.clinvar-source summary').click();
    assert.match(await card.locator('.clinvar-source').innerText(),/Original ClinVar classification: Pathogenic/);
    assert.match(await card.locator('.clinvar-source').innerText(),/not a personal diagnosis/);
    assert.equal(await card.locator('.clinvar-condition-name').innerText(),'Example condition alpha');
    assert.equal(await card.locator('.clinvar-more summary').innerText(),'View all 2 recorded condition names');
    assert.equal(await card.locator('.clinvar-more li').count(),2);
    await card.locator('.clinvar-more summary').click();
    assert.match(await card.locator('.clinvar-more').innerText(),/Another recorded condition name/);
    assert.equal(await page.locator('.clinvar-grid .result-table').count(),0);
    assert.equal(await card.locator('.clinvar-card-footer a').getAttribute('href'),'https://www.ncbi.nlm.nih.gov/clinvar/variation/123456/');
  }finally{await page.close()}
});
test('real browser: ClinVar cards become one column on mobile',async()=>{
  const example={
    id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,
    ref:'C',alt:'A',sig:'Conflicting classifications of pathogenicity',
    review:'criteria provided, single submitter',
    condition:'Example condition alpha|Longer second label',variation:345
  };
  const page=await pageReady([example]);
  try {
    await page.setViewportSize({width:390,height:844});
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('.clinvar-card').waitFor();
    const grid=page.locator('.clinvar-grid');
    assert.equal(await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
    assert.equal(await page.locator('.clinvar-classification--uncertain').count(),1);
    assert.ok((await page.locator('.clinvar-card').boundingBox()).width<390);
  }finally{await page.close()}
});

test('real browser: one-copy recessive-pattern evidence is collapsed, dominant and mixed evidence are prominent',async()=>{
  const basic={id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,ref:'C',alt:'A',
    sig:'Pathogenic',review:'reviewed by expert panel',variation:1345};
  const recessive={...basic,condition:'Autosomal recessive example condition',variation:1345};
  const dominant={...basic,condition:'Autosomal dominant example condition',variation:1346};
  const mixed={...basic,condition:'Autosomal recessive example condition|Autosomal dominant example condition',variation:1347};
  const page=await pageReady([recessive,dominant,mixed]);
  try{
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('.clinvar-secondary').waitFor();
    assert.equal(await page.locator('.clinvar-secondary').count(),1);
    assert.equal(await page.locator('.clinvar-secondary .clinvar-card').count(),1);
    assert.equal(await page.locator('.clinvar-section>.clinvar-grid .clinvar-card').count(),2);
    assert.equal(await page.locator('.clinvar-secondary').evaluate(el=>el.open),false);
    assert.match(await page.locator('.clinvar-secondary>summary').innerText(),/not a diagnosis/);
    assert.match(await page.locator('.clinvar-section>.clinvar-grid .clinvar-personal-status').first().innerText(),/not a diagnosis/);
    assert.match(await page.locator('.clinvar-secondary>summary').innerText(),/1 one-copy finding/);
    await page.locator('.clinvar-secondary>summary').click();
    assert.equal(await page.locator('.clinvar-secondary').evaluate(el=>el.open),true);
    assert.match(await page.locator('.clinvar-secondary .clinvar-card').innerText(),/recessive example condition/);
    const carrierCard=page.locator('.clinvar-secondary .clinvar-card');
    const carrierStatus=await carrierCard.locator('.clinvar-personal-status').innerText();
    assert.match(carrierStatus,/Possible carrier-related finding — not a diagnosis/);
    assert.match(carrierStatus,/does not mean you have that condition/);
    assert.match(carrierStatus,/does not.*confirm carrier status/);
  }finally{await page.close()}
});
test('real browser: two alternate copies remain visible even for recessive pattern',async()=>{
  const example={id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,ref:'C',alt:'A',sig:'Likely pathogenic',
    review:'reviewed by expert panel',condition:'Autosomal recessive example condition',variation:11};
  const page=await pageReady([example]);
  try{
    const text='# build 37\nrsid\tchromosome\tposition\tgenotype\nrs762551\t15\t74749576\tAA\n';
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
    await page.locator('.clinvar-card').waitFor();
    assert.equal(await page.locator('.clinvar-secondary').count(),0);
    assert.equal(await page.locator('.clinvar-section>.clinvar-grid .clinvar-card').count(),1);
    assert.match(await page.locator('.clinvar-copy-context').innerText(),/Two copies/);
    assert.match(await page.locator('.clinvar-personal-status').innerText(),/DNA variant match — not a diagnosis/);
    assert.equal(await page.locator('.clinvar-personal-status--carrier').count(),0);
  }finally{await page.close()}
});
