import {extractDnaFromZip} from './zip-reader.js';
import {parseDNA, isCalledDiploidSnp, isNoCall} from './dna-parser.js';
import {curatedMatches, matchClinvar} from './snp-matching.js';
import {extraCatalog} from './extra-catalog.js';
import {conditionLabels, classificationTone, classificationHeadline, genotypeAlleleContext, inheritanceContext, inheritanceBrief, inheritancePattern, inheritanceDisplay, alleleDoseSummary, clinicalDisplayGroup, reviewLabel} from './clinvar-display.js';
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
    const primaryHits=hits.filter(({e,call})=>clinicalDisplayGroup(e,[...call.genotype].filter(a=>a===e.alt).length)==='main');
    const recessiveHits=hits.filter(({e,call})=>clinicalDisplayGroup(e,[...call.genotype].filter(a=>a===e.alt).length)==='one-copy-recessive');
    const renderCard=({e,call})=>{
      const conditions=conditionLabels(e.condition);

      const alleles=genotypeAlleleContext(call,e);
      if(!alleles)return '';
      const moreConditions=conditions.length>1
        ? `<details class="clinvar-more"><summary>View all ${conditions.length} recorded condition names</summary><ul>${conditions.map(label=>`<li>${safe(label)}</li>`).join('')}</ul></details>`
        : '';
      const tone=classificationTone(e.sig);
      const headline=classificationHeadline(e.sig);
      const clinicalContext=inheritanceContext(e.condition,alleles.alternateCopies);
      const brief=inheritanceBrief(e.condition,alleles.alternateCopies);
      const inheritanceVisual=inheritanceDisplay(e.condition);
      const dose=alleleDoseSummary(e.condition,alleles.alternateCopies,e.sig,e.chr);
      const isPossibleCarrier=clinicalDisplayGroup(e,alleles.alternateCopies)==='one-copy-recessive';
      const isDominantPattern=inheritancePattern(e.condition)==='dominant';
      const personalStatus=isPossibleCarrier
        ? `<div class="clinvar-personal-status clinvar-personal-status--carrier"><strong>Possible carrier-related finding — not a diagnosis</strong><p>You have one alternate copy. For a typical recessive condition, disease-associated changes in <em>both copies of the gene</em> are usually required; the changes can be different. This test cannot confirm carrier status, rule out a second variant, or establish whether changes at two different positions are on opposite gene copies (in trans). It cannot diagnose the condition.</p></div>`
        : isDominantPattern
        ? `<div class="clinvar-personal-status"><strong>Dominant-pattern variant evidence — not a diagnosis</strong><p>One disease-associated gene copy can matter for some dominant conditions. A matching raw DNA allele does not mean you have the condition; the specific variant and clinical evidence are essential.</p></div>`
        : `<div class="clinvar-personal-status"><strong>DNA variant match — not a diagnosis</strong><p>This record is about a genetic variant and a condition, not evidence that you have the condition. Whether it matters to you requires variant-specific interpretation and clinical confirmation.</p></div>`;
      return `<article class="clinvar-card clinvar-card--${inheritanceVisual.tone}" data-inheritance="${inheritanceVisual.tone}" aria-label="ClinVar evidence for ${safe(e.id)}: ${safe(inheritanceVisual.label)}">
        <div class="clinvar-inheritance-banner">
          <span class="clinvar-inheritance-badge"><span class="inheritance-swatch" aria-hidden="true"></span>${safe(inheritanceVisual.label)}</span>
          <span class="clinvar-inheritance-caption">${safe(inheritanceVisual.description)}</span>
        </div>
        ${personalStatus}
        <div class="clinvar-dose-status clinvar-dose-status--${dose.type}" data-copy-meaning="${dose.type}">
          <strong>${safe(dose.heading)}</strong><p>${safe(dose.detail)}</p>
        </div>
        <div class="clinvar-card-header">
          <div class="clinvar-card-identity"><span class="clinvar-gene">${safe(e.gene||'Gene not specified')}</span><strong class="clinvar-rsid">${safe(e.id)}</strong></div>
          <span class="clinvar-classification clinvar-classification--${tone}">${safe(headline)}</span>
        </div>
        <div class="clinvar-card-facts">
          <div class="clinvar-fact"><span class="clinvar-fact-label">Your genotype</span><span class="genotype-chip">${safe(call.genotype)}</span><span class="clinvar-fact-meta clinvar-zygosity">${safe(alleles.zygosity)} · ${alleles.alternateCopies} of 2 alternate allele copies</span></div>
          <div class="clinvar-fact"><span class="clinvar-fact-label">Reference → alternate</span><strong>${safe(alleles.ref)} → ${safe(alleles.alt)}</strong><span class="clinvar-fact-meta">${safe(e.build)} · reference-genome orientation</span></div>
        </div>
        <section class="clinvar-alleles" aria-label="Allele-by-allele explanation">
          <h4>What each allele represents</h4>
          <div class="clinvar-allele-grid">
            <div class="clinvar-allele">
              <div class="clinvar-allele-heading"><span class="clinvar-allele-letter">${safe(alleles.ref)}</span><strong>Reference allele</strong><span class="clinvar-allele-count">${alleles.referenceCopies} ${alleles.referenceCopies===1?'copy':'copies'}</span></div>
              <p>The base shown in the reference genome at this position. “Reference” does not automatically mean protective or harmless.</p>
              <a href="https://www.ncbi.nlm.nih.gov/snp/${safe(e.id)}" target="_blank" rel="noopener noreferrer">Reference SNP details ↗</a>
            </div>
            <div class="clinvar-allele">
              <div class="clinvar-allele-heading"><span class="clinvar-allele-letter">${safe(alleles.alt)}</span><strong>Alternate allele</strong><span class="clinvar-allele-count">${alleles.alternateCopies} ${alleles.alternateCopies===1?'copy':'copies'}</span></div>
              <p>The base change evaluated by the linked ClinVar record for a listed condition. This is variant-level evidence, not a finding about your health.</p>
              <a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${Number(e.variation)}/" target="_blank" rel="noopener noreferrer">Evidence for this allele ↗</a>
            </div>
          </div>
        </section>
        <div class="clinvar-copy-context">
          <span class="clinvar-fact-label">What your allele count tells us</span>
          <p class="clinvar-copy-brief"><strong>${safe(dose.heading)}</strong> ${safe(dose.detail)}</p>
          <p>${safe(alleles.copyMessage)}</p>
          ${dose.type==='benign'||(dose.type==='review'&&inheritanceVisual.tone!=='review')?'':`<p class="clinvar-inheritance">${safe(clinicalContext)}</p>`}
          <a href="https://medlineplus.gov/genetics/understanding/inheritance/inheritancepatterns/" target="_blank" rel="noopener noreferrer">How inheritance patterns work ↗</a>
        </div>
        <div class="clinvar-card-condition">
          <span class="clinvar-fact-label">Condition listed by ClinVar</span>
          <p class="clinvar-condition-name">${safe(conditions[0])}</p>
          ${moreConditions}
        </div>
        <details class="clinvar-source">
          <summary>Exact ClinVar classification and evidence</summary>
          <p><strong>Original ClinVar classification:</strong> ${safe(e.sig)}</p>
          <p><strong>Review status:</strong> ${safe(reviewLabel(e.review))}</p>
          <p>The classification concerns the alternate allele for a specific condition; it is not a personal diagnosis. “Pathogenic” and “Likely pathogenic” are distinct terms and are preserved exactly as reported.</p>
          <p><a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${Number(e.variation)}/" target="_blank" rel="noopener noreferrer">Read this variant's ClinVar entry ↗</a></p>
        </details>
        <div class="clinvar-card-footer">
          <span class="clinvar-review">${safe(reviewLabel(e.review))}</span>
          <a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${Number(e.variation)}/" target="_blank" rel="noopener noreferrer" aria-label="Open ClinVar source for ${safe(e.id)}">View ClinVar record ↗</a>
        </div>
      </article>`;
    };
    const note=window.__snpBuild==='37'||window.__snpBuild==='38'?
      `${hits.length.toLocaleString()} matching variant–condition records`:
      'Exact matching requires a stated genome build (GRCh37 or GRCh38).';
    const limitNote=primaryHits.length>limit||recessiveHits.length>limit?
      `Showing up to ${limit} records per section. Search by gene, rsID or condition to narrow results.`:'';
    const primaryHtml=primaryHits.slice(0,limit).map(renderCard).join('');
    const recessiveHtml=recessiveHits.slice(0,limit).map(renderCard).join('');
    clinicalHtml=`<section class="clinvar-section" aria-label="ClinVar allele-specific evidence">
      <div class="clinvar-heading"><div><h3>ClinVar evidence</h3><p>${safe(note)} · ${safe(clinvarMessage)}</p></div></div>
      <div class="clinvar-legend" aria-label="Inheritance pattern color guide">
        <div class="clinvar-legend-item clinvar-legend-item--recessive"><span class="inheritance-swatch" aria-hidden="true"></span><span><strong>Recessive</strong><small>Usually needs both gene copies affected</small></span></div>
        <div class="clinvar-legend-item clinvar-legend-item--dominant"><span class="inheritance-swatch" aria-hidden="true"></span><span><strong>Dominant</strong><small>One affected gene copy can sometimes matter</small></span></div>
        <div class="clinvar-legend-item clinvar-legend-item--review"><span class="inheritance-swatch" aria-hidden="true"></span><span><strong>Mixed / special</strong><small>Different or more complex inheritance</small></span></div>
        <div class="clinvar-legend-item clinvar-legend-item--unspecified"><span class="inheritance-swatch" aria-hidden="true"></span><span><strong>Unspecified</strong><small>Cannot infer a pattern from the name</small></span></div>
      </div>
      <p class="clinvar-legend-note">Colors organize condition-name patterns only, not disease likelihood or diagnosis. A variant may have different implications for different conditions.</p>
      <p class="clinvar-disclaimer">These are variant-level research records, NOT disease diagnoses or verified carrier-screening results. An rsID is a variant identifier, not its chromosome position. Two detected variants in one gene do not prove that both gene copies are affected; phase (cis versus trans), untested variants, and clinical interpretation matter. The original ClinVar classification remains available in each card’s source details. Consumer DNA calls need clinical confirmation.</p>
      ${limitNote?`<p class="clinvar-limit">${safe(limitNote)}</p>`:''}
      ${primaryHtml?`<div class="clinvar-grid">${primaryHtml}</div>`:''}
      ${recessiveHtml?`<details class="clinvar-secondary" aria-label="One-copy findings with recessive condition names">
        <summary><strong>${recessiveHits.length.toLocaleString()} one-copy ${recessiveHits.length===1?'finding':'findings'} with recessive condition names</strong><span>Possible carrier-related evidence · not a diagnosis</span></summary>
        <p class="clinvar-secondary-note">These records have one alternate allele and condition names that mention recessive inheritance without a dominant or X-linked label. They do not mean you have the condition. This provisional grouping is not a confirmed carrier-screening result. A second variant may be untested; even when two variants are detected, SNP-chip data often cannot show whether they are on opposite gene copies. All findings remain available for review.</p>
        <div class="clinvar-grid">${recessiveHtml}</div>
      </details>`:''}
    </section>`;
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
