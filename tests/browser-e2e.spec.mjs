import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../dist/',import.meta.url));
let server, browser, origin;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
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
    assert.equal(await card.evaluate(el=>el.open),false,'ClinVar variant should start collapsed');
    assert.match(await card.locator('.clinvar-card-overview').innerText(),/Genotype/);
    await card.locator(':scope>summary').click();
    assert.equal(await card.evaluate(el=>el.open),true);
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
    assert.equal(await card.evaluate(el=>el.open),false);
    await card.locator(':scope>summary').click();
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
    assert.equal(await carrierCard.evaluate(el=>el.open),false);
    await carrierCard.locator(':scope>summary').click();
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
    assert.equal(await card.evaluate(el=>el.open),false);
    await card.locator(':scope>summary').click();
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
    assert.equal(await card.evaluate(el=>el.open),false);
    await card.locator(':scope>summary').click();
    assert.equal(await card.locator('.clinvar-condition-details').evaluate(el=>el.open),false);
    assert.match(await card.locator('.clinvar-benign-note').innerText(),/Not evidence of the listed condition/);
    await card.locator('.clinvar-condition-details>summary').click();
    assert.match(await card.locator('.clinvar-condition-brief').innerText(),/hereditary cancer susceptibility syndrome/);
    assert.equal(await card.locator('.clinvar-classification').innerText(),'Benign variant');
    assert.equal(await card.evaluate(el=>el.open),true);
    assert.equal(await card.locator('.clinvar-personal-status').count(),0);
    assert.equal(await card.getAttribute('data-inheritance'),'benign');
    assert.match(await card.locator('.clinvar-benign-note').innerText(),/two copies at this position does not make this variant harmful/);
    assert.equal(await card.locator('.clinvar-dose-status').count(),0);
    assert.equal(await card.locator('.clinvar-benign-reassurance').count(),0);
    assert.equal(await card.locator('.clinvar-classification--benign').count(),1);
    assert.equal(await card.locator('.clinvar-condition-details').count(),1);
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
    assert.equal(await page.locator('.context-compact').count(),0);

    await page.locator('#context-age').fill('35');
    await page.locator('#context-sex').selectOption('female');
    await page.locator('#context-ancestry').selectOption('multiple');
    assert.match(await page.locator('#context-summary').innerText(),/Age: 35/);
    assert.match(await page.locator('#context-summary').innerText(),/Female at birth/);
    assert.match(await page.locator('#context-summary').innerText(),/Multiple \/ mixed backgrounds/);
    assert.equal(await benign.evaluate(el=>el.open),true);
    assert.equal(await page.locator('.clinvar-card--benign').count(),1);
    assert.match(await page.locator('.context-compact').innerText(),/Age matters for population cancer rates/);
    assert.match(await page.locator('.context-compact').innerText(),/Sex-related anatomy/);
    assert.match(await page.locator('.context-compact').innerText(),/Genetic studies may have unequal representation/);
    assert.equal(await page.locator('.clinvar-classification--benign').count(),1);
    assert.equal(await page.locator('.clinvar-dose-status--benign').count(),0);
    assert.doesNotMatch(await page.locator('.context-compact').innerText(),/\d+%|increased risk|average risk/i);
    assert.deepEqual(outgoing,[]);

    await page.locator('#clear').click();
    assert.equal(await page.locator('#results').isVisible(),false);
    assert.equal(await page.locator('#context-age').inputValue(),'');
    assert.equal(await page.locator('#context-sex').inputValue(),'');
    assert.equal(await page.locator('#context-ancestry').inputValue(),'');
    assert.match(await page.locator('#context-summary').innerText(),/No personal context selected/);
  }finally{await page.close()}
});

test('real browser: evidence tabs isolate clinical, carrier, traits and benign evidence',async()=>{
  const base={id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,
    ref:'C',alt:'A',review:'reviewed by expert panel'};
  const entries=[
    {...base,sig:'Pathogenic',condition:'Autosomal dominant example condition',variation:8001},
    {...base,sig:'Pathogenic',condition:'Autosomal recessive example condition',variation:8002},
    {...base,sig:'Benign',condition:'Example harmless condition',variation:8003}
  ];
  const page=await pageReady(entries);
  try{
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('#tab-panel-clinical .clinvar-card').first().waitFor();
    assert.equal(await page.locator('#tab-clinical').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#tab-panel-clinical .clinvar-card').count(),1);
    assert.equal(await page.locator('#tab-panel-research').isVisible(),false);
    assert.equal(await page.locator('#tab-panel-carrier').isVisible(),false);
    assert.equal(await page.locator('#tab-panel-benign').isVisible(),false);

    await page.locator('#tab-carrier').click();
    assert.equal(await page.locator('#tab-carrier').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#tab-panel-clinical').isVisible(),false);
    assert.equal(await page.locator('#tab-panel-carrier .clinvar-secondary .clinvar-card').count(),1);
    assert.match(await page.locator('#tab-panel-carrier').innerText(),/not confirmed carrier-screening results or diagnoses/);

    await page.locator('#tab-research').click();
    assert.equal(await page.locator('#tab-panel-research').isVisible(),true);
    assert.match(await page.locator('#tab-panel-research').innerText(),/Caffeine metabolism/);
    assert.match(await page.locator('#tab-panel-research').innerText(),/research associations/);
    assert.equal(await page.locator('#filter').isVisible(),true);
    await page.locator('#filter').selectOption('Nutrition');
    assert.match(await page.locator('#tab-panel-research').innerText(),/Caffeine metabolism/);
    await page.locator('#filter').selectOption('all');

    await page.locator('#tab-benign').click();
    assert.equal(await page.locator('#tab-panel-benign').isVisible(),true);
    assert.equal(await page.locator('#tab-panel-benign .clinvar-benign-example .clinvar-card').count(),1);
    assert.match(await page.locator('#tab-panel-benign').innerText(),/benign variant found/i);
    assert.match(await page.locator('#tab-description').innerText(),/Benign is not the same as protective/);
    assert.equal(await page.locator('#filter').isVisible(),false);

    await page.locator('#tab-benign').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#tab-research').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#tab-research').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#tab-clinical').getAttribute('aria-selected'),'true');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#tab-benign').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#result-tabs [role="tab"]').count(),4);
    assert.equal(await page.locator('#result-tabs .result-tab-family').count(),1);
    assert.equal(await page.locator('#tab-explore').count(),0);
    assert.equal(await page.locator('.baby-eye-explorer').count(),0);
  }finally{await page.close()}
});

test('real browser: one benign marker shows a single green badge with neutral details',async()=>{
  const evidence=[{id:'rs762551',gene:'LIAS',build:'GRCh37',chr:'15',pos:74749576,
    ref:'C',alt:'A',sig:'Benign',review:'reviewed by expert panel',
    condition:'Example inherited condition',variation:30303}];
  const page=await pageReady(evidence);
  try{
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    await page.locator('#tab-benign').click();
    const card=page.locator('.clinvar-benign-example>.clinvar-card');
    await card.waitFor();
    assert.equal(await card.locator('.clinvar-classification--benign').count(),1);
    assert.equal(await card.locator('.clinvar-classification').innerText(),'Benign variant');
    assert.equal(await card.locator('.clinvar-personal-status').count(),0);
    assert.equal(await card.locator('.clinvar-dose-status').count(),0);
    assert.equal(await card.locator('.clinvar-benign-reassurance').count(),0);
    assert.equal(await card.evaluate(el=>el.open),false);
    await card.locator(':scope>summary').click();
    assert.match(await card.locator('.clinvar-benign-note').innerText(),/Not evidence of the listed condition/);
    assert.equal(await card.locator('.clinvar-condition-details').evaluate(el=>el.open),false);
    const styles=await card.evaluate(el=>{
      const badge=el.querySelector('.clinvar-classification');
      const note=el.querySelector('.clinvar-benign-note');
      const box=el.querySelector('.clinvar-card-facts');
      return {badge:getComputedStyle(badge).backgroundColor,note:getComputedStyle(note).backgroundColor,
        facts:getComputedStyle(box).backgroundColor};
    });
    assert.notEqual(styles.badge,styles.note,'Only the badge should use a colored status background');
    assert.notEqual(styles.badge,styles.facts,'Genotype details should not repeat the green badge');
    await card.locator('.clinvar-source>summary').click();
    assert.match(await card.locator('.clinvar-source').innerText(),/Original ClinVar classification: Benign/);
  }finally{await page.close()}
});


test('real browser: SERPINA1 S and Z together appear before other clinical cards and remain collapsible',async()=>{
  const clinical={id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,
    ref:'C',alt:'A',sig:'Pathogenic',review:'reviewed by expert panel',
    condition:'Autosomal dominant example condition',variation:45321};
  const page=await pageReady([clinical]);
  try{
    const raw='# genome build 37\nrsid\tchromosome\tposition\tgenotype\nrs762551\t15\t74749576\tCA\nrs28929474\t14\t94844947\tCT\nrs17580\t14\t94847262\tAT\n';
    await page.locator('#file').setInputFiles({name:'serpina1-example.txt',mimeType:'text/plain',buffer:Buffer.from(raw)});
    assert.equal(await page.locator('#tab-clinical').getAttribute('aria-selected'),'true');
    const first=await page.locator('#tab-panel-clinical').evaluate(el=>el.firstElementChild?.className);
    assert.match(first,/serpina1-panel/);
    const panel=page.locator('#tab-panel-clinical>.serpina1-panel');
    await panel.waitFor();
    assert.equal(await panel.evaluate(el=>el.open),true);
    assert.match(await panel.locator('summary').first().innerText(),/Both an S allele and a Z allele detected/);
    assert.match(await panel.innerText(),/cannot prove the variants lie on opposite gene copies/);
    const another=page.locator('#tab-panel-clinical .clinvar-card');
    assert.equal(await another.count(),1);
    assert.equal(await another.evaluate(el=>el.open),false);
    assert.match(await another.locator(':scope>summary').innerText(),/EXAMPLE/);
    await panel.locator(':scope>summary').click();
    assert.equal(await panel.evaluate(el=>el.open),false);
    await another.locator(':scope>summary').click();
    assert.equal(await another.evaluate(el=>el.open),true);
    await page.locator('#context-age').fill('35');
    assert.equal(await panel.evaluate(el=>el.open),false);
    assert.equal(await another.evaluate(el=>el.open),true);
  }finally{await page.close()}
});
test('real browser: one CFTR cystic fibrosis variant is possible carrier information with partner-testing guidance',async()=>{
  const rs='rs987654321';
  const evidence={id:rs,gene:'CFTR',build:'GRCh37',chr:'7',pos:117199644,
    ref:'C',alt:'T',sig:'Pathogenic',review:'reviewed by expert panel',
    condition:'Cystic fibrosis',variation:987654};
  const page=await pageReady([evidence]);
  try{
    const raw='# genome build 37\nrsid\tchromosome\tposition\tgenotype\n'+rs+'\t7\t117199644\tCT\n';
    await page.locator('#file').setInputFiles({name:'synthetic-cftr.txt',mimeType:'text/plain',buffer:Buffer.from(raw)});
    await page.waitForFunction(()=>document.querySelector('#tab-carrier')?.getAttribute('aria-selected')==='true');
    assert.equal(await page.locator('#tab-carrier').getAttribute('aria-selected'),'true');
    assert.match(await page.locator('#tab-panel-carrier .tab-panel-intro').innerText(),/both are confirmed carriers/);
    const card=page.locator('#tab-panel-carrier .clinvar-secondary .clinvar-card');
    await card.waitFor();
    assert.equal(await card.count(),1);
    assert.equal(await card.evaluate(el=>el.open),false);
    assert.match(await card.locator(':scope>summary').innerText(),/Possible CF carrier-related finding/);
    assert.equal(await page.locator('#tab-panel-clinical .clinvar-card').count(),0);
    await card.locator(':scope>summary').click();
    assert.equal(await card.evaluate(el=>el.open),true);
    const note=card.locator('.carrier-family-planning');
    assert.match(await note.innerText(),/Possible cystic fibrosis carrier-related finding/);
    assert.match(await note.innerText(),/does not mean you have cystic fibrosis/);
    assert.match(await note.innerText(),/both confirmed carriers/);
    assert.match(await note.innerText(),/1 in 4 \(25%\)/);
    assert.match(await note.innerText(),/do not need to be identical/);
    assert.match(await note.innerText(),/clinical CFTR carrier screening/);
    assert.equal(await note.locator('a').getAttribute('href'),'https://www.cff.org/intro-cf/cf-genetics-basics');
    assert.match(await card.locator('.clinvar-inheritance-banner').innerText(),/Recessive pattern: cystic fibrosis/);
    assert.match(await card.locator('.clinvar-dose-status').innerText(),/possible carrier-related information/);
  }finally{await page.close()}
});
test('real browser: benign CFTR call is benign, not a carrier alert',async()=>{
  const rs='rs987654321';
  const evidence={id:rs,gene:'CFTR',build:'GRCh37',chr:'7',pos:117199644,
    ref:'C',alt:'T',sig:'Benign',review:'reviewed by expert panel',
    condition:'Cystic fibrosis',variation:987655};
  const page=await pageReady([evidence]);
  try{
    const raw='# genome build 37\nrsid\tchromosome\tposition\tgenotype\n'+rs+'\t7\t117199644\tCT\n';
    await page.locator('#file').setInputFiles({name:'synthetic-cftr.txt',mimeType:'text/plain',buffer:Buffer.from(raw)});
    await page.waitForFunction(()=>document.querySelector('#tab-benign')?.getAttribute('aria-selected')==='true');
    assert.equal(await page.locator('#tab-benign').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#tab-panel-carrier .clinvar-secondary').count(),0);
    assert.equal(await page.locator('.carrier-family-planning').count(),0);
    assert.equal(await page.locator('#tab-panel-benign .clinvar-classification--benign').count(),1);
    assert.match(await page.locator('#tab-panel-benign .clinvar-card-overview').innerText(),/Not evidence of the listed condition/);
  }finally{await page.close()}
});

test('real browser: card chevron has a visible up/down state and hover does not hide clinical evidence',async()=>{
 const fixture={id:'rs762551',gene:'EXAMPLE',build:'GRCh37',chr:'15',pos:74749576,
   ref:'C',alt:'A',sig:'Pathogenic',review:'reviewed by expert panel',
   condition:'Autosomal dominant example condition',variation:45211};
 const page=await pageReady([fixture]);
 try{
   await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
   const card=page.locator('#tab-panel-clinical .clinvar-card');
   await card.waitFor();
   const toggle=card.locator('.clinvar-card-toggle');
   assert.equal(await card.evaluate(el=>el.open),false);
   assert.equal(await toggle.locator('.toggle-closed-label').isVisible(),true);
   assert.equal(await toggle.locator('.toggle-open-label').isVisible(),false);
   const before=await toggle.locator('.toggle-chevron').evaluate(el=>getComputedStyle(el).transform);
   await card.locator(':scope>summary').click();
   await page.waitForFunction(previous=>{
     const chevron=document.querySelector('#tab-panel-clinical .clinvar-card .toggle-chevron');
     return chevron&&getComputedStyle(chevron).transform!==previous;
   },before);
   const after=await toggle.locator('.toggle-chevron').evaluate(el=>getComputedStyle(el).transform);
   assert.notEqual(before,after);
   assert.equal(await toggle.locator('.toggle-open-label').isVisible(),true);
   assert.equal(await toggle.locator('.toggle-closed-label').isVisible(),false);
   await page.locator('#tab-carrier').click();
   assert.equal(await page.locator('#tab-panel-explore').count(),0);
   assert.equal(await page.locator('.baby-eye-explorer').count(),0);
   assert.match(await page.locator('#tab-panel-carrier .tab-panel-intro').innerText(),/carrier-screening results or diagnoses/);
   assert.equal(await page.locator('#variant-toolbar').isVisible(),true);
   await page.locator('#tab-clinical').click();
   assert.equal(await page.locator('#variant-toolbar').isVisible(),true);
 }finally{await page.close()}
});

test('real browser: hero trust assurances sit clearly beneath primary buttons on desktop and mobile',async()=>{
  const page=await pageReady();
  try{
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      const hero=page.locator('.hero'),actions=page.locator('.hero-actions'),trust=page.locator('.hero .trust');
      const [heroBox,actionsBox,trustBox]=await Promise.all([hero.boundingBox(),actions.boundingBox(),trust.boundingBox()]);
      assert.ok(heroBox&&actionsBox&&trustBox);
      assert.ok(trustBox.y>=actionsBox.y+actionsBox.height,'Privacy assurances should follow the buttons');
      assert.ok(trustBox.y+trustBox.height<=heroBox.y+heroBox.height+2,'Privacy assurances should fit inside hero');
      assert.equal(await trust.isVisible(),true);
      const style=await trust.evaluate(el=>({size:parseFloat(getComputedStyle(el).fontSize),
        margin:parseFloat(getComputedStyle(el).marginTop)}));
      assert.ok(style.size>=12,'Trust details need readable type');
      assert.ok(style.margin<=30,'Excessive gap under buttons must not return');
    }
  }finally{await page.close()}
});

test('real browser: repository link stays accessible in top menu on desktop and mobile',async()=>{
  const page=await pageReady();
  try{
    const link=page.locator('.topbar nav .repo-link');
    assert.equal(await link.getAttribute('href'),'https://github.com/spilthoorenmaya-cmd/snp-reader');
    assert.equal(await link.getAttribute('target'),'_blank');
    assert.match(await link.getAttribute('rel'),/noopener/);
    for(const width of [1280,768,390,320]){
      await page.setViewportSize({width,height:850});
      assert.equal(await link.isVisible(),true,'GitHub link should be visible at '+width+'px');
      const rect=await link.boundingBox();
      assert.ok(rect&&rect.x>=0&&rect.x+rect.width<=width+1,'GitHub link should fit '+width+'px viewport');
    }
  }finally{await page.close()}
});

test('real browser: fictional demo does not expose an unrelated SERPINA1 medical panel',async()=>{
  const page=await pageReady();
  try {
    await page.locator('#demo').click();
    await page.waitForFunction(()=>document.querySelector('#total')?.textContent==='4');
    assert.match(await page.locator('#result-summary').innerText(),/Demo only — fictional DNA data/);
    assert.match(await page.locator('#result-summary').innerText(),/not your personal results/);
    await page.locator('#tab-carrier').click();
    assert.equal(await page.locator('.serpina1-panel').count(),0,
      'No SERPINA1 banner should appear when neither S nor Z was found in the sample');
    assert.match(await page.locator('#tab-panel-carrier').innerText(),/not a negative carrier-screening result/i);
    await page.locator('#search').fill('SERPINA1');
    assert.equal(await page.locator('.serpina1-panel').count(),1,
      'Someone specifically searching for SERPINA1 may still inspect missing-marker coverage');
  }finally{await page.close()}
});

test('real browser: GitHub Pages favicon resolves and privacy uses a lock, not a clover',async()=>{
  const page=await pageReady();
  try {
    const icon=page.locator('head link[rel="icon"]');
    assert.equal(await icon.count(),1);
    assert.equal(await icon.getAttribute('type'),'image/svg+xml');
    const href=await icon.getAttribute('href');
    assert.match(href,/^favicon\.svg(?:\?[^ ]*)?$/);
    const res=await page.request.get(new URL(href,origin).toString());
    assert.equal(res.status(),200);
    assert.match(res.headers()['content-type'],/image\/svg\+xml/);
    assert.match(await res.text(),/<svg[^>]+viewBox="0 0 64 64"/);
    assert.equal(await page.locator('.privacy-bottom-symbol svg').count(),1);
    assert.doesNotMatch(await page.locator('.privacy-bottom').innerText(),/♧/);
    assert.match(await page.locator('.drop .local-note').innerText(),/Your file is never sent/);
  }finally{await page.close()}
});

test('rsID contribution is opt-in, excludes known IDs, and never includes genotypes',async()=>{
  const page=await pageReady();
  try{
    await page.locator('#file').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(
      '# genome build 37\nrsid\tchromosome\tposition\tgenotype\nrs762551\t15\t74749576\tAA\nrs987654321\t1\t123456\tAG\n'
    )});
    await page.locator('#contribute').waitFor({state:'visible'});
    assert.equal(await page.locator('#contribute-download').isDisabled(),true);
    assert.match(await page.locator('#contribute-count').innerText(),/1 genomic marker positions \(identified by rsID\)/);
    await page.locator('#contribute-consent').check();
    const downloadPromise=page.waitForEvent('download');
    await page.locator('#contribute-download').click();
    const download=await downloadPromise;
    const stream=await download.createReadStream();
    const chunks=[];for await(const chunk of stream)chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(),'rs987654321\n');
    await page.locator('#clear').click();
    assert.equal(await page.locator('#contribute').isVisible(),false);
  }finally{await page.close()}
});
test('fictional sample never offers contribution',async()=>{
  const page=await pageReady();
  try{
    await page.locator('#demo').click();
    assert.equal(await page.locator('#contribute').isVisible(),false);
  }finally{await page.close()}
});
