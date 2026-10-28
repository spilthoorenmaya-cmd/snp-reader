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

test('real browser: cards show a compact, sourced condition summary and expandable allele details',async()=>{
  const example={
    id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,
    ref:'C',alt:'A',sig:'Pathogenic',review:'reviewed by expert panel',
    condition:'Example condition alpha|not provided|Another recorded condition name|Example condition alpha',
    variation:123456
  };
  const page=await pageReady([example]);
  try {
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    const card=page.locator('.clinvar-card').first();
    await card.waitFor();
    assert.equal(await page.locator('.clinvar-gene-group').count(),0);
    assert.equal(await page.locator('.clinvar-single').count(),1);
    assert.match(await card.locator('.clinvar-gene').innerText(),/EXAMPLE/);
    const singleBox=await card.boundingBox();
    const containerBox=await page.locator('.clinvar-single').boundingBox();
    assert.ok(singleBox.width>containerBox.width*0.9,'Single variant should use most of the available width');
    const rootBox=await page.locator('#cards').boundingBox();
    assert.ok(singleBox.width>rootBox.width*0.75,'Single variant must span the outer results area, not a half-width parent column');
    assert.match(await card.locator('.clinvar-gene').innerText(),/EXAMPLE/);
    assert.equal(await card.locator('.clinvar-classification').innerText(),'Clinical evidence available');
    assert.equal(await card.locator('.clinvar-condition-name').innerText(),'Example condition alpha');
    assert.match(await card.locator('.clinvar-condition-brief').innerText(),/condition name recorded/);
    assert.match(await card.locator('.clinvar-personal-status').innerText(),/not a diagnosis/);
    assert.equal(await card.locator('.clinvar-explanation').evaluate(el=>el.open),false);
    assert.equal(await card.locator('.clinvar-allele').count(),2);
    await card.locator('.clinvar-explanation>summary').click();
    assert.match(await card.locator('.clinvar-allele-grid').innerText(),/Reference allele/);
    assert.match(await card.locator('.clinvar-allele-grid').innerText(),/Alternate allele/);
    assert.match(await card.locator('.clinvar-copy-context').innerText(),/One copy of the alternate allele/);
    assert.equal(await card.locator('.clinvar-allele').first().locator('a').getAttribute('href'),'https://www.ncbi.nlm.nih.gov/snp/rs762551');
    assert.equal(await card.locator('.clinvar-allele').last().locator('a').getAttribute('href'),'https://www.ncbi.nlm.nih.gov/clinvar/variation/123456/');
    await card.locator('.clinvar-source>summary').click();
    assert.match(await card.locator('.clinvar-source').innerText(),/Original ClinVar classification: Pathogenic/);
    assert.equal(await card.locator('.clinvar-more>summary').innerText(),'View all 2 recorded condition names');
    await card.locator('.clinvar-more>summary').click();
    assert.match(await card.locator('.clinvar-more').innerText(),/Another recorded condition name/);
  }finally{await page.close()}
});
test('real browser: responsive inheritance colors retain readable text labels',async()=>{
  const entry={id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,
    ref:'C',alt:'A',sig:'Conflicting classifications of pathogenicity',
    review:'criteria provided, single submitter',condition:'Example condition alpha',variation:345};
  const page=await pageReady([entry]);
  try{
    await page.setViewportSize({width:390,height:844});
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    const card=page.locator('.clinvar-card').first();
    await card.waitFor();
    assert.equal(await card.getAttribute('data-inheritance'),'unspecified');
    assert.match(await card.locator('.clinvar-inheritance-badge').innerText(),/Inheritance not specified/);
    assert.equal(await page.locator('.clinvar-legend-item').count(),4);
    const grid=page.locator('.clinvar-grid').first();
    assert.equal(await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
    assert.equal(await page.locator('.clinvar-classification--uncertain').count(),1);
    assert.ok((await card.boundingBox()).width<390);
  }finally{await page.close()}
});
test('real browser: single-copy recessive records are secondary; dominant/mixed are distinct',async()=>{
  const basic={id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,ref:'C',alt:'A',
    sig:'Pathogenic',review:'reviewed by expert panel',variation:1345};
  const recessive={...basic,condition:'Autosomal recessive example condition',variation:1345};
  const dominant={...basic,condition:'Autosomal dominant example condition',variation:1346};
  const mixed={...basic,condition:'Autosomal recessive example condition|Autosomal dominant example condition',variation:1347};
  const page=await pageReady([recessive,dominant,mixed]);
  try{
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('#tab-carrier').click();
    const secondary=page.locator('#tab-panel-carrier .clinvar-secondary');
    await secondary.waitFor();
    assert.equal(await secondary.evaluate(el=>el.open),true);
    assert.equal(await secondary.locator('.clinvar-card').count(),1);
    const primary=page.locator('.clinvar-section>.clinvar-gene-groups .clinvar-card');
    assert.equal(await primary.count(),2);
    assert.equal(await page.locator('.clinvar-section>.clinvar-gene-groups .clinvar-card--dominant').count(),1);
    assert.equal(await page.locator('.clinvar-section>.clinvar-gene-groups .clinvar-card--review').count(),1);
    assert.match(await secondary.locator(':scope>summary').innerText(),/not a diagnosis/);
    const carrierCard=secondary.locator('.clinvar-card');
    assert.match(await carrierCard.locator('.clinvar-personal-status').innerText(),/Possible carrier-related information/);
    assert.match(await carrierCard.locator('.clinvar-dose-status').innerText(),/usually insufficient alone for a recessive condition/);
    await carrierCard.locator('.clinvar-explanation>summary').click();
    assert.match(await carrierCard.locator('.clinvar-copy-context').innerText(),/in trans/);
  }finally{await page.close()}
});
test('real browser: homozygous alternate recessive call is visible but not called a diagnosis',async()=>{
  const entry={id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,ref:'C',alt:'A',
    sig:'Likely pathogenic',review:'reviewed by expert panel',condition:'Autosomal recessive example condition',variation:11};
  const page=await pageReady([entry]);
  try{
    const raw='# build 37\nrsid\tchromosome\tposition\tgenotype\nrs762551\t15\t74749576\tAA\n';
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(raw)});
    const card=page.locator('.clinvar-card');
    await card.waitFor();
    assert.equal(await page.locator('.clinvar-secondary').count(),0);
    assert.equal(await page.locator('.clinvar-section>.clinvar-gene-groups .clinvar-card').count(),1);
    assert.match(await card.locator('.clinvar-zygosity').innerText(),/Homozygous alternate/);
    assert.match(await card.locator('.clinvar-dose-status').innerText(),/Two alternate copies/);
    assert.match(await card.locator('.clinvar-dose-status').innerText(),/do not establish a diagnosis/);
    assert.match(await card.locator('.clinvar-personal-status').innerText(),/not a diagnosis/);
  }finally{await page.close()}
});
test('real browser: benign BRCA2 variants show only one example until more are requested',async()=>{
  const evidence=[{
    id:'rs206076',gene:'BRCA2',build:'GRCh37',chr:'13',pos:32900000,ref:'G',alt:'C',
    sig:'Benign',review:'reviewed by expert panel',
    condition:'Breast-ovarian cancer, familial, susceptibility to, 2',variation:132780
  },{
    id:'rs4942486',gene:'BRCA2',build:'GRCh37',chr:'13',pos:32900001,ref:'T',alt:'C',
    sig:'Benign',review:'criteria provided, single submitter',
    condition:'Breast-ovarian cancer, familial, susceptibility to, 2',variation:126190
  }];
  const page=await pageReady(evidence);
  try{
    const data='# build 37\nrsid\tchromosome\tposition\tgenotype\nrs206076\t13\t32900000\tCC\nrs4942486\t13\t32900001\tCC\n';
    await page.locator('#file').setInputFiles({name:'brca2-fixture.txt',mimeType:'text/plain',buffer:Buffer.from(data)});
    const benign=page.locator('.clinvar-benign');
    await benign.waitFor();
    assert.equal(await page.locator('#tab-benign').getAttribute('aria-selected'),'true');
    assert.equal(await benign.evaluate(el=>el.open),true);
    assert.match(await benign.locator(':scope>summary').innerText(),/2 benign variants found/);
    assert.equal(await page.locator('.clinvar-section>.clinvar-gene-groups .clinvar-card').count(),0);
    const example=benign.locator('.clinvar-benign-example>.clinvar-card');
    assert.equal(await example.count(),1);
    assert.match(await example.innerText(),/rs206076/);
    assert.match(await benign.locator('.clinvar-benign-example-caption').innerText(),/One example/);
    const more=benign.locator('.clinvar-benign-rest');
    assert.equal(await more.count(),1);
    assert.equal(await more.evaluate(el=>el.open),false);
    assert.match(await more.locator(':scope>summary').innerText(),/Show 1 other benign record/);
    const card=example;
    assert.equal(await card.locator('.clinvar-condition-details').evaluate(el=>el.open),false);
    assert.match(await card.locator('.clinvar-benign-reassurance').innerText(),/not a sign that you have the condition/);
    await card.locator('.clinvar-condition-details>summary').click();
    assert.match(await card.locator('.clinvar-condition-brief').innerText(),/hereditary cancer susceptibility syndrome/);
    assert.match(await card.locator('.clinvar-dose-status').innerText(),/benign variant/);
    assert.match(await card.locator('.clinvar-personal-status').innerText(),/Benign BRCA2 variant — not evidence of BRCA2-related cancer/);
    assert.equal(await card.getAttribute('data-inheritance'),'benign');
    assert.match(await card.locator('.clinvar-dose-status').innerText(),/Two copies do not turn a benign variant into disease evidence/);
    await more.locator(':scope>summary').click();
    assert.equal(await more.evaluate(el=>el.open),true);
    assert.equal(await more.locator('.clinvar-card').count(),1);
    assert.match(await more.locator('.clinvar-card').innerText(),/rs4942486/);
    assert.equal(await benign.locator('.clinvar-card').count(),2);
    const firstBox=await example.boundingBox(), secondBox=await more.locator('.clinvar-card').boundingBox();
    assert.ok(firstBox.width>0.75*(await page.locator('#cards').boundingBox()).width);
    assert.ok(secondBox.y>=firstBox.y+firstBox.height,'Other variants should be stacked below the single example');
  }finally{await page.close()}
});

test('real browser: age, sex and ancestry are optional, private and never change benign ClinVar classification',async()=>{
  const fixture={id:'rs762551',gene:'TESTGENE',build:'GRCh37',chr:'15',pos:74749576,
    ref:'C',alt:'A',sig:'Benign',review:'reviewed by expert panel',
    condition:'Hereditary breast cancer',variation:5000};
  const page=await pageReady([fixture]);
  const outgoing=[];
  page.on('request',request=>{
    if(request.method()!=='GET'||/age=|ancestry=|female|european|context=/i.test(request.url()))outgoing.push({method:request.method(),url:request.url()});
  });
  try{
    await page.locator('#file').setInputFiles({name:'local.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('#tab-benign').click();
    const benign=page.locator('.clinvar-benign');
    await benign.waitFor();
    assert.equal(await benign.evaluate(el=>el.open),true);
    assert.equal(await page.locator('#context-age').inputValue(),'');
    assert.equal(await page.locator('#context-sex').inputValue(),'');
    assert.equal(await page.locator('#context-ancestry').inputValue(),'');
    assert.equal(await page.locator('.clinvar-gene-context').count(),0);

    await page.locator('#context-age').fill('35');
    await page.locator('#context-sex').selectOption('female');
    await page.locator('#context-ancestry').selectOption('multiple');
    assert.match(await page.locator('#context-summary').innerText(),/Age: 35/);
    assert.match(await page.locator('#context-summary').innerText(),/Female at birth/);
    assert.match(await page.locator('#context-summary').innerText(),/Multiple \/ mixed backgrounds/);
    assert.equal(await benign.evaluate(el=>el.open),true);
    assert.equal(await page.locator('.clinvar-card--benign').count(),1);
    assert.match(await page.locator('.clinvar-gene-context').innerText(),/Age matters for population cancer rates/);
    assert.match(await page.locator('.clinvar-gene-context').innerText(),/Sex-related anatomy/);
    assert.match(await page.locator('.clinvar-gene-context').innerText(),/Genetic studies may have unequal representation/);
    assert.match(await page.locator('.clinvar-dose-status--benign').innerText(),/Benign variant/);
    assert.doesNotMatch(await page.locator('.clinvar-gene-context').innerText(),/\d+%|increased risk|average risk/i);
    assert.deepEqual(outgoing,[]);

    await page.locator('#clear').click();
    assert.equal(await page.locator('#results').isVisible(),false);
    assert.equal(await page.locator('#context-age').inputValue(),'');
    assert.equal(await page.locator('#context-sex').inputValue(),'');
    assert.equal(await page.locator('#context-ancestry').inputValue(),'');
    assert.match(await page.locator('#context-summary').innerText(),/No personal context selected/);
  }finally{await page.close()}
});
