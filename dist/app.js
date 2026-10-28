import {extractDnaFromZip} from './zip-reader.js';
import {parseDNA, isCalledDiploidSnp, isNoCall} from './dna-parser.js';
import {curatedMatches, matchClinvar} from './snp-matching.js';
import {extraCatalog} from './extra-catalog.js';
// SNP Reader MVP: deliberately static. Uploaded raw DNA never leaves this browser.
const catalog = [
  {id:'rs4988235',gene:'MCM6 / LCT',title:'Adult lactose digestion',category:'Nutrition',alleles:['A','G'],evidence:'Established population association',source:'https://medlineplus.gov/genetics/condition/lactose-intolerance/',detail:'This regulatory variant near LCT helps control whether lactase production continues after childhood. The A allele on the GRCh37 forward strand is associated with lactase persistence in many European populations.',interpret(g){return g.includes('A')?'At least one A allele is associated with continued lactase production into adulthood in populations where this marker has been validated.':'GG is associated with lactase non-persistence in many European populations, but other genetic variants and non-genetic causes also affect lactose digestion.'},caution:'This single marker is less informative across some ancestries. Symptoms and clinical evaluation matter more than this genotype alone.'},
  {id:'rs1800562',gene:'HFE',title:'Iron regulation (C282Y)',category:'Health',alleles:['A','G'],evidence:'Clinical gene association',source:'https://medlineplus.gov/genetics/condition/hereditary-hemochromatosis/',detail:'HFE helps regulate iron absorption. The A allele corresponds to the C282Y change on the forward strand.',interpret(g){const a=[...g].filter(x=>x==='A').length;return a===2?'AA indicates two copies of the HFE C282Y variant, associated with increased risk of hereditary hemochromatosis. Not everyone with this genotype develops iron overload.':a===1?'AG indicates one C282Y copy (carrier status). One copy alone usually does not cause classic HFE-related hemochromatosis.':'GG does not show the C282Y variant at this marker. Other HFE variants and other causes of iron overload are not ruled out.'},caution:'Do not diagnose or change iron intake based on a consumer raw-data call. Discuss concerns with a clinician; confirmation and iron studies may be appropriate.'}
]; 
catalog.push(...extraCatalog);
const $=id=>document.getElementById(id);
let records=new Map(),mode='';
let inventory=null;
let clinvarEntries=[], clinvarMessage='ClinVar reference catalog has not been generated yet.';
async function loadClinvar(){
  try{
    const response=await fetch('clinvar-evidence.json',{cache:'no-cache'});
    if(!response.ok) throw Error('Reference catalog has not been published yet');
    const payload=await response.json();
    if(!Array.isArray(payload.entries)) throw Error('Invalid ClinVar catalog');
    clinvarEntries=payload.entries;
    clinvarMessage=`ClinVar evidence snapshot: ${payload.generated||'unknown date'} · ${payload.count.toLocaleString()} allele-specific records`;
    if(records.size){refreshAnnotatedCount();draw();}
  }catch(e){clinvarMessage=`ClinVar reference unavailable: ${e.message}. Curated results still work.`;if(records.size)draw()}
}
function clinvarMatches(){return matchClinvar(records,clinvarEntries,window.__snpBuild)}
function refreshAnnotatedCount(){
  const validIds=curatedMatches(records,catalog).filter(c=>c.valid).map(c=>c.id);
  for(const {e} of clinvarMatches())validIds.push(e.id);
  $('annotated').textContent=new Set(validIds).size.toLocaleString();
}
async function loadInventory(){
  try{
    const response=await fetch('https://raw.githubusercontent.com/spilthoorenmaya-cmd/snp-reader/main/data/rsid_list.txt',{cache:'force-cache'});
    if(!response.ok)throw Error('Inventory unavailable');
    inventory=new Set((await response.text()).trim().split(/\r?\n/));
    $('inventory-status').textContent=`${inventory.size.toLocaleString()} rsIDs ready to search`;
    updateInventoryCount();
  }catch{$('inventory-status').textContent='Reference inventory could not load. Curated interpretations still work.'}
}
function updateInventoryCount(){if(inventory&&records.size)$('inventorymatched').textContent=[...records.keys()].filter(id=>inventory.has(id)).length.toLocaleString()}
function lookupInventory(){
  const id=$('inventory-search').value.trim().toLowerCase();
  if(!/^rs\d+$/.test(id)){$('inventory-status').textContent='Enter an rsID, for example rs4988235.';return}
  if(!inventory){$('inventory-status').textContent='Reference inventory is still loading.';return}
  const known=inventory.has(id),curated=catalog.some(c=>c.id===id);
  $('inventory-status').textContent=known?`${id} is in the MyHeritage GSA inventory.${curated?' A curated explanation is available.':' No curated interpretation yet.'}`:`${id} was not in this supplied GSA inventory. Another chip version may include it.`;
}
function safe(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function matches(){return curatedMatches(records,catalog)}
function draw(){
  const term=$('search').value.toLowerCase().trim(),category=$('filter').value;
  const filtered=matches().filter(c=>(category==='all'||c.category===category)&&[c.id,c.gene,c.title,c.category].join(' ').toLowerCase().includes(term));
  // The curated catalog is a subset of markers in the user's file; keep other calls browseable.
  const rows=filtered.map(c=>{
    const g=c.call?.genotype||'';
    const valid=c.valid;
    const meaning=c.meaning;
    return `<tr><td><strong>${safe(c.id)}</strong><span class="td-sub">${safe(c.gene)}</span></td><td><span class="topic-title">${safe(c.title)}</span><span class="tag">${safe(c.category)}</span></td><td><span class="genotype-chip">${safe(g||'—')}</span><span class="td-sub">${valid?'Called':c.call?'Unresolved':'Not found'}</span></td><td class="interpretation-cell"><div class="interpretation-main">${safe(meaning)}</div><details><summary>Evidence and limitations</summary><p>${safe(c.detail)}</p><p class="evidence-caution">ⓘ ${safe(c.caution)}</p><small>Evidence: ${safe(c.evidence)}</small><div class="table-links"><a href="${c.source}" target="_blank" rel="noopener">NIH evidence ↗</a><a href="https://www.ncbi.nlm.nih.gov/snp/${c.id}" target="_blank" rel="noopener">dbSNP ↗</a><a href="https://www.ncbi.nlm.nih.gov/clinvar/?term=${c.id}" target="_blank" rel="noopener">ClinVar ↗</a></div></details></td></tr>`;
  }).join('');
  const curatedTable=filtered.length?`<div class="result-table-scroll"><table class="result-table"><thead><tr><th>SNP / Gene</th><th>Research topic</th><th>Genotype</th><th>Meaning & evidence</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty">No curated interpretation matches this search.</div>';
  let otherRows='',shown=0,totalOther=0;
  const curatedIds=new Set(catalog.map(c=>c.id));
  // Show additional markers without inventing genotype-to-trait interpretations.
  // Render at most 100 rows to keep large consumer raw files responsive.
  if(category==='all'){
    for(const [id,call] of records){
      if(curatedIds.has(id))continue;
      if(term&&!id.includes(term))continue;
      totalOther++;
      if(shown>=100)continue;
      shown++;
      const status=call.genotype==='--'||call.genotype==='00'?'No-call':'Raw genotype';
      const known=inventory?inventory.has(id):false;
      otherRows+=`<tr><td><strong>${safe(id)}</strong><span class="td-sub">${known?'In marker inventory':'Not in reference / not checked'}</span></td><td>Unreviewed marker</td><td><span class="genotype-chip">${safe(call.genotype)}</span></td><td class="interpretation-cell">No validated interpretation in SNP Reader yet. <span class="td-sub">${status} · Consumer raw data</span><div class="table-links"><a href="https://www.ncbi.nlm.nih.gov/snp/${id}" target="_blank" rel="noopener">dbSNP ↗</a><a href="https://www.ncbi.nlm.nih.gov/clinvar/?term=${id}" target="_blank" rel="noopener">Search ClinVar ↗</a></div></td></tr>`;
    }
  }
  const otherTable=category==='all'&&totalOther?`<h3 class="uncurated-heading">Other markers in your file</h3><p class="uncurated-note">Showing ${shown.toLocaleString()} of ${totalOther.toLocaleString()} unreviewed matches${term?' for this search':''}. Search by rsID to find a specific marker. An rsID or a ClinVar search result is not, by itself, a medical finding.</p><div class="result-table-scroll"><table class="result-table"><thead><tr><th>rsID</th><th>Catalog status</th><th>Genotype</th><th>Research links</th></tr></thead><tbody>${otherRows}</tbody></table></div>`:'';
  const hits=clinvarMatches().filter(({e})=>!term||[e.id,e.gene,e.condition,e.sig].join(' ').toLowerCase().includes(term));
  let clinicalHtml='';
  if(category==='all'||category==='Health'){
    const limit=200;
    const html=hits.slice(0,limit).map(({e,call})=>`<tr><td><strong>${safe(e.id)}</strong><span class="td-sub">${safe(e.gene||'Unspecified')}</span></td><td><strong>${safe(e.sig)}</strong><span class="td-sub">${safe(e.condition||'Condition not specified')}</span></td><td><span class="genotype-chip">${safe(call.genotype)}</span><span class="td-sub">${safe(e.ref)} → ${safe(e.alt)}, ${safe(e.build)}</span></td><td class="interpretation-cell">A ClinVar record classifies this specific allele for the listed condition. This is not a diagnosis or a risk estimate.<span class="td-sub">${safe(e.review)}</span><div class="table-links"><a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${Number(e.variation)}/" target="_blank" rel="noopener">ClinVar record ↗</a></div></td></tr>`).join('');
    const note=window.__snpBuild==='37'||window.__snpBuild==='38'? `${hits.length} matching variant-condition records`:'Exact ClinVar matching requires a stated genome build (GRCh37 or GRCh38); unknown-build files are not assigned clinical findings.';
    clinicalHtml=`<h3 class="uncurated-heading">ClinVar allele-specific evidence</h3><p class="uncurated-note">${safe(clinvarMessage)}. ${safe(note)}. Matches require rsID, chromosome, position, reference/alternate allele and genome build. Confirm any health-relevant finding in a clinical lab.</p>${html?`<div class="result-table-scroll"><table class="result-table"><thead><tr><th>Variant</th><th>ClinVar classification</th><th>Uploaded call</th><th>Evidence</th></tr></thead><tbody>${html}</tbody></table></div>`:''}`;
  }
  $('cards').innerHTML=curatedTable+clinicalHtml+otherTable;
}
function show(result,label){window.__snpBuild=result.build;records=result.records;mode=label;$('results').hidden=false;$('error').hidden=true;$('total').textContent=records.size.toLocaleString();refreshAnnotatedCount();$('nocalls').textContent=[...records.values()].filter(x=>isNoCall(x.genotype)).length.toLocaleString();updateInventoryCount();$('result-summary').textContent=`${label} · ${result.format}${result.build?' · Genome build '+result.build:''}. Showing curated interpretations; the marker inventory is separate.`;$('search').value='';$('filter').value='all';draw();$('results').scrollIntoView({behavior:'smooth',block:'start'})}
async function handle(file){
  if(!file)return;
  const status=$('upload-status');
  $('error').hidden=true;
  status.textContent=`Reading ${file.name} locally…`;
  try{
    if(file.size>120*1024*1024)throw Error('File exceeds the 120 MB limit. Extract the raw DNA text file if needed.');
    const text=/\.zip$/i.test(file.name)?await extractDnaFromZip(file):await file.text();
    // Give the browser a chance to show the loading state before parsing.
    await new Promise(resolve=>setTimeout(resolve,0));
    const result=parseDNA(text);
    status.textContent=`Loaded ${result.records.size.toLocaleString()} markers from ${file.name}`;
    show(result,file.name);
  }catch(e){
    status.textContent=`Unable to read ${file.name}`;
    $('error').textContent=e.message||'Could not read this file. Please try the original raw DNA export.';
    $('error').hidden=false;
    $('error').scrollIntoView({behavior:'smooth',block:'center'});
  }
}
const demo=`# Synthetic sample, forward strand build 37\nrsid\tchromosome\tposition\tgenotype\nrs4988235\t2\t136608646\tAG\nrs762551\t15\t74749576\tAA\nrs1800562\t6\t26093141\tAG\nrs999999\t1\t123456\tAA`;
$('inventory-button').addEventListener('click',lookupInventory);
$('inventory-search').addEventListener('keydown',e=>{if(e.key==='Enter')lookupInventory()});
loadInventory();
loadClinvar();
const picker=$('file');
picker.addEventListener('change',()=>{const selected=picker.files?.[0];if(selected){$('upload-status').textContent=`Selected: ${selected.name}`;handle(selected)}});
['dragenter','dragover'].forEach(t=>$('drop').addEventListener(t,e=>{e.preventDefault();$('drop').classList.add('drag')}));['dragleave','drop'].forEach(t=>$('drop').addEventListener(t,e=>{e.preventDefault();$('drop').classList.remove('drag')}));$('drop').addEventListener('drop',e=>handle(e.dataTransfer.files[0]));$('demo').addEventListener('click',()=>show(parseDNA(demo),'Fictional sample genome'));$('search').addEventListener('input',draw);$('filter').addEventListener('change',draw);$('clear').addEventListener('click',()=>{records.clear();mode='';$('file').value='';$('results').hidden=true;$('upload').scrollIntoView({behavior:'smooth'})});$('export').addEventListener('click',()=>{const rows=[['rsID','gene','topic','genotype','interpretation','evidence_source']];for(const c of matches()){const g=c.call?.genotype||'';rows.push([c.id,c.gene,c.title,g,c.meaning,c.source])}const csv=rows.map(r=>r.map(s=>'"'+String(s).replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.href=url;a.download='snp-reader-curated-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
