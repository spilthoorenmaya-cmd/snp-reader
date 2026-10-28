import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const files=['styles.css','table.css','inventory.css'];
const read=name=>readFileSync(resolve(dist,name),'utf8');

function validateCss(css,file){
  let depth=0,paren=0,brackets=0,quote=null,comment=false;
  for(let i=0;i<css.length;i++){
    const c=css[i],n=css[i+1];
    if(comment){
      if(c==='*'&&n==='/'){comment=false;i++}
      continue;
    }
    if(quote){
      if(c==='\\'){i++;continue}
      if(c===quote)quote=null;
      continue;
    }
    if(c==='/'&&n==='*'){comment=true;i++;continue}
    if(c==='"'||c==="'"){quote=c;continue}
    if(c==='(')paren++;
    if(c===')')paren--;
    if(c==='[')brackets++;
    if(c===']')brackets--;
    if(c==='{')depth++;
    if(c==='}')depth--;
    assert.ok(depth>=0&&paren>=0&&brackets>=0,file+': unmatched closing token');
  }
  assert.equal(depth,0,file+': unclosed CSS rule');
  assert.equal(paren,0,file+': unclosed parentheses');
  assert.equal(brackets,0,file+': unclosed attribute selector');
  assert.equal(comment,false,file+': unclosed CSS comment');
  assert.equal(quote,null,file+': unclosed CSS string');
}

test('all deployed stylesheets have balanced, parseable rule delimiters',()=>{
 for(const file of files)validateCss(read(file),file);
});

test('legacy markup and unreachable CSS from obsolete SNP cards stay removed',()=>{
 const html=read('index.html');
 const css=files.map(read).join('\n');
 for(const className of ['strand','art-orbit','variant-card','card-top','card-links',
   'clinvar-copy-brief','clinvar-benign-reassurance','clinvar-dose-status--benign']){
   const selector=new RegExp('\\.'+className+'(?=[\\s:>{.#,]|$)');
   assert.doesNotMatch(css,selector,'Unexpected obsolete CSS selector '+className);
 }
 assert.doesNotMatch(html,/class="strand"|class="art-orbit"/);
 assert.match(html,/class="hero-art"/);
 assert.match(read('styles.css'),/dna-hero\.png/);
 assert.ok(existsSync(resolve(dist,'dna-hero.png')));
});

test('local stylesheet, script and imported module assets resolve in dist',()=>{
 const html=read('index.html');
 const refs=[
  ...[...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map(x=>x[1]),
  ...[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(x=>x[1])
 ];
 for(const ref of refs){
   if(/^(?:https?:|#|data:)/.test(ref))continue;
   const relative=ref.split('?')[0];
   assert.ok(existsSync(resolve(dist,relative)),'Missing local site asset: '+relative);
 }
 assert.match(html,/<script type="module" src="app\.js/);
 for(const module of ['app.js','baby-eye-explorer.js','clinvar-display.js','snp-matching.js']){
   const source=read(module);
   for(const match of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)){
     assert.ok(existsSync(resolve(dist,dirname(module),match[1])),
       module+' imports missing local module '+match[1]);
   }
 }
});

test('reviewed results keep distinct clinical, carrier and research entry points',()=>{
 const html=read('index.html');
 for(const name of ['clinical','carrier','research','benign']){
   assert.match(html,new RegExp('id="tab-'+name+'"'));
 }
 const js=read('app.js');
 assert.match(js,/readEyeMarker/);
 assert.match(js,/carrierPlanningNote/);
 assert.match(js,/matchClinvar/);
});
