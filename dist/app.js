import {extractDnaFromZip} from './zip-reader.js';
import {selectBenignExample} from './benign-example.js';
import {interpretSerpina1} from './serpina1.js';
import {parseDNA, isCalledDiploidSnp, isNoCall} from './dna-parser.js';
import {curatedMatches, matchClinvar} from './snp-matching.js';
import {extraCatalog} from './extra-catalog.js';
import {normalizePersonalContext,personalContextSummary,conditionContextNote} from './personal-context.js';
import {conditionLabels, conditionBrief, classificationTone, classificationHeadline, genotypeAlleleContext, inheritanceContext, inheritanceBrief, inheritancePattern, inheritanceDisplay, alleleDoseSummary, clinicalDisplayGroup, carrierPlanningNote, isCysticFibrosisCondition, reviewLabel} from './clinvar-display.js';
// SNP Reader MVP: deliberately static. Uploaded raw DNA never leaves this browser.
const catalog = [
  {id:'rs4988235',gene:'MCM6 / LCT',title:'Adult lactose digestion',category:'Nutrition',alleles:['A','G'],evidence:'Established population association',source:'https://medlineplus.gov/genetics/condition/lactose-intolerance/',detail:'This regulatory variant near LCT helps control whether lactase production continues after childhood. The A allele on the GRCh37 forward strand is associated with lactase persistence in many European populations.',interpret(g){return g.includes('A')?'At least one A allele is associated with continued lactase production into adulthood in populations where this marker has been validated.':'GG is associated with lactase non-persistence in many European populations, but other genetic variants and non-genetic causes also affect lactose digestion.'},caution:'This single marker is less informative across some ancestries. Symptoms and clinical evaluation matter more than this genotype alone.'},
  {id:'rs1800562',gene:'HFE',title:'Iron regulation (C282Y)',category:'Health',alleles:['A','G'],evidence:'Clinical gene association',source:'https://medlineplus.gov/genetics/condition/hereditary-hemochromatosis/',detail:'HFE helps regulate iron absorption. The A allele corresponds to the C282Y change on the forward strand.',interpret(g){const a=[...g].filter(x=>x==='A').length;return a===2?'AA indicates two copies of the HFE C282Y variant, associated with increased risk of hereditary hemochromatosis. Not everyone with this genotype develops iron overload.':a===1?'AG indicates one C282Y copy (carrier status). One copy alone usually does not cause classic HFE-related hemochromatosis.':'GG does not show the C282Y variant at this marker. Other HFE variants and other causes of iron overload are not ruled out.'},caution:'Do not diagnose or change iron intake based on a consumer raw-data call. Discuss concerns with a clinician; confirmation and iron studies may be appropriate.'}
]; 
catalog.push(...extraCatalog);
const $=id=>document.getElementById(id);
let records=new Map(),mode='';
const resultTabNames=['clinical','carrier','research','benign'];
const resultTabExplanations={
 clinical:'ClinVar allele-specific classifications that may deserve closer review. A match does not mean you have a condition.',
 carrier:'One-copy recessive-pattern findings and special inheritance checks. These do not confirm carrier status or a diagnosis.',
 research:'Genotype-specific traits and research associations from reviewed sources. Evidence strength varies; associations are not diagnoses.',
 benign:'Variants classified as benign for particular conditions, plus unreviewed raw markers. Benign is not the same as protective.'
};
let activeResultTab='research';
function selectResultTab(name,focus=false){
  if(!resultTabNames.includes(name))return;
  activeResultTab=name;
  for(const tabName of resultTabNames){
    const selected=tabName===name;
    const button=$('tab-'+tabName);
    const panel=$('tab-panel-'+tabName);
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
    if(panel)panel.hidden=!selected;
  }
  $('tab-description').textContent=resultTabExplanations[name];
  $('filter').hidden=name!=='research';
  if(focus)$('tab-'+name).focus();
}
function preferredResultTab(){
  const hits=clinvarMatches();
  const isBenign=e=>['benign','likely benign','benign/likely benign'].includes(String(e.sig||'').trim().toLowerCase());
  const primary=hits.some(({e,call})=>!isBenign(e)&&clinicalDisplayGroup(e,[...call.genotype].filter(a=>a===e.alt).length)==='main');
  const carrier=hits.some(({e,call})=>clinicalDisplayGroup(e,[...call.genotype].filter(a=>a===e.alt).length)==='one-copy-recessive');
  const report=interpretSerpina1(records,window.__snpBuild);
  const [z,s]=report.markers.map(m=>m.alternateCopies||0);
  if(primary||z===2||(z&&s))return 'clinical';
  if(carrier||z===1||s>0)return 'carrier';
  if(matches().some(c=>c.valid))return 'research';
  if(hits.length)return 'benign';
  return 'research';
}

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
  for(const marker of interpretSerpina1(records,window.__snpBuild).markers)if(marker.status==='checked')validIds.push(marker.id);
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
function readPersonalContext(){
  return normalizePersonalContext({age:$('context-age').value,sex:$('context-sex').value,ancestry:$('context-ancestry').value});
}
function updatePersonalContext(){
  const ageValue=$('context-age').value.trim();
  const ageInvalid=ageValue!==''&&(!/^\d{1,3}$/.test(ageValue)||Number(ageValue)>120);
  $('context-summary').textContent=ageInvalid
    ? 'Age must be a whole number from 0 to 120; an invalid age will not be used.'
    : personalContextSummary(readPersonalContext());
  if(records.size)draw();
}
function matches(){return curatedMatches(records,catalog)}
function draw(){
  // Keep any expanded overview sections open when personal context changes.
  const openVariantKeys=new Set([...($('cards')?.querySelectorAll('.clinvar-card[open]')||[])].map(el=>el.getAttribute('data-variant-key')));
  const previousSerpina=$('cards')?.querySelector('.serpina1-panel');
  const serpinaWasOpen=previousSerpina?previousSerpina.open:null;
  const openBenign=Boolean($('cards')?.querySelector('.clinvar-benign')?.open);
  const openOtherBenign=Boolean($('cards')?.querySelector('.clinvar-benign-rest')?.open);
  const openRecessive=Boolean($('cards')?.querySelector('.clinvar-secondary')?.open);
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
  {
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
  const otherTable=totalOther?`<h3 class="uncurated-heading">Other markers in your file</h3><p class="uncurated-note">Showing ${shown.toLocaleString()} of ${totalOther.toLocaleString()} unreviewed matches${term?' for this search':''}. Search by rsID to find a specific marker. An rsID or a ClinVar search result is not, by itself, a medical finding.</p><div class="result-table-scroll"><table class="result-table"><thead><tr><th>rsID</th><th>Catalog status</th><th>Genotype</th><th>Research links</th></tr></thead><tbody>${otherRows}</tbody></table></div>`:'';
  const hits=clinvarMatches().filter(({e})=>!term||[e.id,e.gene,e.condition,e.sig].join(' ').toLowerCase().includes(term));
  let clinicalHtml='', clinicalPrimaryCount=0, clinicalCarrierCount=0, clinicalBenignCount=0;
  {
    const limit=200;
    const isBenign=(e)=>/^(?:benign|likely benign|benign\/likely benign)$/i.test(String(e.sig||'').trim());
    const benignHits=hits.filter(({e})=>isBenign(e));
    const primaryHits=hits.filter(({e,call})=>!isBenign(e)&&clinicalDisplayGroup(e,[...call.genotype].filter(a=>a===e.alt).length)==='main');
    const recessiveHits=hits.filter(({e,call})=>clinicalDisplayGroup(e,[...call.genotype].filter(a=>a===e.alt).length)==='one-copy-recessive');
    clinicalPrimaryCount=primaryHits.length;
    clinicalCarrierCount=recessiveHits.length;
    clinicalBenignCount=benignHits.length;
    const renderCard=({e,call})=>{
      const conditions=conditionLabels(e.condition);
      const definition=conditionBrief(e.condition);

      const alleles=genotypeAlleleContext(call,e);
      if(!alleles)return '';
      const moreConditions=conditions.length>1
        ? `<details class="clinvar-more"><summary>View all ${conditions.length} recorded condition names</summary><ul>${conditions.map(label=>`<li>${safe(label)}</li>`).join('')}</ul></details>`
        : '';
      const tone=classificationTone(e.sig);
      const headline=classificationHeadline(e.sig);
      const isPossibleCarrier=clinicalDisplayGroup(e,alleles.alternateCopies)==='one-copy-recessive';
      const carrierNote=carrierPlanningNote(e,alleles.alternateCopies);
      const isCfCarrier=isPossibleCarrier&&isCysticFibrosisCondition(e);
      const clinicalContext=isCfCarrier
        ? 'Cystic fibrosis usually requires disease-causing changes in both CFTR gene copies. One call at this marker cannot establish whether another relevant variant exists or whether two variants are on opposite copies.'
        : inheritanceContext(e.condition,alleles.alternateCopies);
      const doseBase=alleleDoseSummary(e.condition,alleles.alternateCopies,e.sig,e.chr);
      const dose=isCfCarrier
        ? {type:'carrier',heading:'One CFTR allele detected: possible carrier-related information',detail:'Confirm the variant clinically before drawing conclusions about your own health or a future child.'}
        : doseBase;
      const inheritanceVisual=dose.type==='benign'
        ? {tone:'benign',label:'Benign variant',description:'This alternate allele is not classified as causing the listed condition.'}
        : isCfCarrier
        ? {tone:'recessive',label:'Recessive pattern: cystic fibrosis',description:'Partner testing can matter when planning children, after both variants are clinically confirmed.'}
        : inheritanceDisplay(e.condition);
      const isDominantPattern=inheritancePattern(e.condition)==='dominant';
      const statusLabel=isPossibleCarrier
        ? 'Possible carrier-related information · not a diagnosis'
        : isDominantPattern
        ? 'Dominant-pattern variant evidence · not a diagnosis'
        : 'Variant-level evidence · not a diagnosis';
      const personalStatus=`<p class="clinvar-personal-status ${isPossibleCarrier?'clinvar-personal-status--carrier':''}" role="note"><span aria-hidden="true">ⓘ</span><strong>${safe(statusLabel)}</strong></p>`;
      return `<details class="clinvar-card clinvar-card--${inheritanceVisual.tone}" data-inheritance="${inheritanceVisual.tone}" data-variant-key="${safe(e.id)}-${Number(e.variation)}" aria-label="ClinVar evidence for ${safe(e.id)}: ${safe(inheritanceVisual.label)}">
        <summary class="clinvar-card-overview">
          <span class="clinvar-card-header">
            <span class="clinvar-card-identity"><span class="clinvar-gene">${safe(e.gene||'Gene not specified')}</span><strong class="clinvar-rsid">${safe(e.id)}</strong></span>
            <span class="clinvar-classification clinvar-classification--${tone}">${safe(dose.type==='benign'?'Benign variant':headline)}</span>
          </span>
          <span class="clinvar-card-overview-meta">
            <span>Genotype: <strong>${safe(call.genotype)}</strong></span>
            <span>${safe(dose.type==='benign'?'Not evidence of the listed condition':isCfCarrier?'Possible CF carrier-related finding · consider partner testing':isPossibleCarrier?'Possible carrier information · partner screening may matter':dose.type==='dominant'?'Dominant-pattern variant · not a diagnosis':'Variant evidence · not a diagnosis')}</span>
            <span class="clinvar-card-toggle" aria-hidden="true">View details</span>
          </span>
        </summary>
        <div class="clinvar-card-body">
        ${dose.type==='benign'
          ? `<p class="clinvar-benign-note" role="note">Not evidence of the listed condition. ${alleles.alternateCopies===2?'Having two copies at this position does not make this variant harmful.':alleles.alternateCopies===1?'Having one copy at this position does not make this variant harmful.':'No alternate copies were found at this position.'} This does not assess the entire gene.</p>`
          : `${personalStatus}<div class="clinvar-inheritance-banner">
              <span class="clinvar-inheritance-badge"><span class="inheritance-swatch" aria-hidden="true"></span>${safe(inheritanceVisual.label)}</span>
              <span class="clinvar-inheritance-caption">${safe(inheritanceVisual.description)}</span>
            </div>`}
        ${dose.type==='benign'
          ? `<details class="clinvar-condition-details"><summary>About the condition listed in ClinVar</summary>
              <div class="clinvar-card-condition">
                <span class="clinvar-fact-label">ClinVar research context · not your diagnosis</span>
                <p class="clinvar-condition-name">${safe(conditions[0])}</p>
                <p class="clinvar-condition-brief">${safe(definition.text)}</p>
                <p class="clinvar-context-note">ClinVar uses a condition name to describe the research context for this specific variant. It does not mean you have that condition.</p>
                ${moreConditions}
                <a class="clinvar-condition-source" href="https://www.ncbi.nlm.nih.gov/medgen/?term=${encodeURIComponent(conditions[0])}" target="_blank" rel="noopener noreferrer">Learn about this condition ↗</a>
              </div>
            </details>`
          : `<div class="clinvar-card-condition">
              <span class="clinvar-fact-label">Condition listed by ClinVar</span>
              <p class="clinvar-condition-name">${safe(conditions[0])}</p>
              <p class="clinvar-condition-brief">${safe(definition.text)}</p>
              ${moreConditions}
              <a class="clinvar-condition-source" href="https://www.ncbi.nlm.nih.gov/medgen/?term=${encodeURIComponent(conditions[0])}" target="_blank" rel="noopener noreferrer">Learn about this condition ↗</a>
            </div>`}
        <div class="clinvar-card-facts ${dose.type==='benign'?'clinvar-card-facts--benign':''}">
          <div class="clinvar-fact"><span class="clinvar-fact-label">Your genotype</span><span class="genotype-chip">${safe(call.genotype)}</span><span class="clinvar-fact-meta clinvar-zygosity">${safe(alleles.zygosity)} · ${alleles.alternateCopies} of 2 alternate allele copies</span></div>
          <div class="clinvar-fact"><span class="clinvar-fact-label">Reference → alternate</span><strong>${safe(alleles.ref)} → ${safe(alleles.alt)}</strong><span class="clinvar-fact-meta">${safe(e.build)} · reference-genome orientation</span></div>
        </div>
        ${dose.type==='benign'?'':`<div class="clinvar-dose-status clinvar-dose-status--${dose.type}" data-copy-meaning="${dose.type}">
          <strong>${safe(dose.heading)}</strong><p>${safe(dose.detail)}</p>
        </div>`}
        ${carrierNote?`<section class="carrier-family-planning" aria-label="Carrier information for family planning">
          <h4>${safe(carrierNote.title)}</h4>
          <p>${safe(carrierNote.message)}</p>
          <p><strong>If planning children:</strong> ${safe(carrierNote.partner)}</p>
          <p>${safe(carrierNote.action)}</p>
          <a href="${carrierNote.source}" target="_blank" rel="noopener noreferrer">Inheritance and carrier-screening reference ↗</a>
        </section>`:''}
        <details class="clinvar-explanation">
          <summary>Understand alleles, copy count and limitations</summary>
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
          <p>${safe(alleles.copyMessage)}</p>
          ${dose.type==='benign'||(dose.type==='review'&&inheritanceVisual.tone!=='review')?'':`<p class="clinvar-inheritance">${safe(clinicalContext)}</p>`}
          <a href="https://medlineplus.gov/genetics/understanding/inheritance/inheritancepatterns/" target="_blank" rel="noopener noreferrer">How inheritance patterns work ↗</a>
        </div>
        </details>
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
        </div>
      </details>`;
    };
    const note=window.__snpBuild==='37'||window.__snpBuild==='38'?
      `${hits.length.toLocaleString()} matching variant–condition records`:
      'Exact matching requires a stated genome build (GRCh37 or GRCh38).';
    const limitNote=primaryHits.length>limit||recessiveHits.length>limit||benignHits.length>limit?
      `Showing up to ${limit} records per section. Search by gene, rsID or condition to narrow results.`:'';
    const personalContext=readPersonalContext();
    const renderGeneGroups=(records)=>{
      const byGene=new Map();
      for(const hit of records.slice(0,limit)){
        const gene=String(hit.e.gene||'Gene not specified').trim()||'Gene not specified';
        if(!byGene.has(gene))byGene.set(gene,[]);
        byGene.get(gene).push(hit);
      }
      return [...byGene].map(([gene,geneHits])=>{
        const geneNote=gene.toUpperCase()==='BRCA2'
          ? 'BRCA2 is a normal DNA-repair gene. A benign BRCA2 variant does not indicate cancer or a harmful BRCA2 mutation. This upload does not test every possible variant in BRCA2.'
          : 'Each result concerns an individual variant—not the entire gene. A benign finding does not rule out other variants.';
        const contextNote=conditionContextNote(geneHits.map(h=>h.e.condition),personalContext);
        const contextHtml=contextNote
          ? `<p class="clinvar-gene-context"><strong>Personal context (self-reported):</strong> ${safe(contextNote)}</p>`
          : '';
        // A gene with one record needs one full-width card, not a nested group.
        if(geneHits.length===1){
          return `<div class="clinvar-single" aria-label="${safe(gene)} single variant result">
            ${contextHtml}
            <div class="clinvar-grid">${renderCard(geneHits[0])}</div>
          </div>`;
        }
        return `<section class="clinvar-gene-group" aria-label="${safe(gene)} variant records">
        <header class="clinvar-gene-header">
          <div><h4>${safe(gene)}</h4><span>${geneHits.length} ${geneHits.length===1?'variant record':'variant records'}</span></div>
          <p>${safe(geneNote)}</p>
        </header>
        ${contextHtml}
        <div class="clinvar-grid">${geneHits.map(renderCard).join('')}</div>
      </section>`;
      }).join('');
    };
    const primaryHtml=renderGeneGroups(primaryHits);
    const recessiveHtml=renderGeneGroups(recessiveHits);
    const benignSelection=selectBenignExample(benignHits.slice(0,limit));
    const benignHtml=benignSelection.example?renderCard(benignSelection.example):'';
    const otherBenignHtml=renderGeneGroups(benignSelection.remaining);
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
      ${primaryHtml?`<div class="clinvar-gene-groups">${primaryHtml}</div>`:''}
      ${benignHtml?`<details class="clinvar-benign" aria-label="Benign variant records">
        <summary><strong>${benignHits.length.toLocaleString()} ${benignHits.length===1?'benign variant':'benign variants'} found</strong><span>Generally not linked to increased risk for their listed conditions · not a whole-gene test</span></summary>
        <p class="clinvar-secondary-note">Benign and likely benign variants are generally not disease-causing for their listed conditions. One example is shown below, chosen for its source review status—not because it is more important or protective. These findings cannot rule out other variants in the gene.</p>
        <div class="clinvar-benign-example">
          <div class="clinvar-benign-example-caption"><strong>One example</strong><span>${safe(benignSelection.example?.e?.gene||'')} · ${safe(benignSelection.example?.e?.id||'')}</span></div>
          ${benignSelection.example&&conditionContextNote([benignSelection.example.e.condition],personalContext)
            ?`<p class="clinvar-gene-context"><strong>Personal context (self-reported):</strong> ${safe(conditionContextNote([benignSelection.example.e.condition],personalContext))}</p>`
            :''}
          ${benignHtml}
        </div>
        ${otherBenignHtml?`<details class="clinvar-benign-rest">
          <summary>Show ${benignSelection.remaining.length.toLocaleString()} other benign ${benignSelection.remaining.length===1?'record':'records'}</summary>
          <p>These remain available for research, but do not indicate that you have a condition. The list may be limited to ${limit} records; search by gene or rsID to find a specific result.</p>
          <div class="clinvar-gene-groups">${otherBenignHtml}</div>
        </details>`:''}
      </details>`:''}
      ${recessiveHtml?`<details class="clinvar-secondary" aria-label="One-copy findings with recessive condition names">
        <summary><strong>${recessiveHits.length.toLocaleString()} one-copy ${recessiveHits.length===1?'finding':'findings'} with recessive condition names</strong><span>Possible carrier-related evidence · not a diagnosis</span></summary>
        <p class="clinvar-secondary-note">These records have one alternate allele and condition names that mention recessive inheritance without a dominant or X-linked label. They do not mean you have the condition. This provisional grouping is not a confirmed carrier-screening result. A second variant may be untested; even when two variants are detected, SNP-chip data often cannot show whether they are on opposite gene copies. All findings remain available for review.</p>
        <div class="clinvar-gene-groups">${recessiveHtml}</div>
      </details>`:''}
    </section>`;
  }
  let serpinaHtml='';
  const serpinaQuery='serpina1 alpha-1 alpha 1 antitrypsin aat deficiency rs28929474 rs17580 z s';
  if(!term||serpinaQuery.includes(term)){
    const report=interpretSerpina1(records,window.__snpBuild);
    const detected=report.markers.filter(m=>m.alternateCopies>0).length;
    const details=report.markers.map(marker=>{
      const detail=marker.status==='checked'?marker.description:marker.description;
      const state=marker.status==='checked'?'Checked':marker.status==='not-tested'?'Not in file':marker.status==='no-call'?'No call':'Cannot verify';
      return `<li class="serpina1-marker" data-marker="${safe(marker.id)}" data-status="${marker.status}">
        <div><strong>${safe(marker.name)}</strong><a href="https://www.ncbi.nlm.nih.gov/snp/${safe(marker.id)}" target="_blank" rel="noopener noreferrer">${safe(marker.id)} ↗</a></div>
        <span class="serpina1-marker-call">${safe(marker.call||'Not available')} · ${safe(state)}</span>
        <p>${safe(detail)}</p>
        <small>Reference → alternate: ${safe(marker.ref)} → ${safe(marker.alt)} on the genomic plus strand</small>
        <a href="https://www.ncbi.nlm.nih.gov/clinvar/variation/${marker.clinvar}/" target="_blank" rel="noopener noreferrer">ClinVar evidence ↗</a>
      </li>`;
    }).join('');
    const expand=detected>0||(term&&serpinaQuery.includes(term))?' open':'';
    serpinaHtml=`<details class="serpina1-panel serpina1-panel--${safe(report.tone)}" data-coverage="${report.complete?'complete':'incomplete'}"${expand}>
      <summary><span class="serpina1-summary-title">SERPINA1 · Alpha-1 antitrypsin</span><strong>${safe(report.heading)}</strong><span class="serpina1-summary-meta">${safe(report.coverage)} · S and Z marker check</span></summary>
      <div class="serpina1-body">
        <p class="serpina1-intro">This condition has <strong>codominant inheritance</strong>. Combinations of S and Z alleles can have different implications. SNP Reader does not assume the rest of your SERPINA1 gene was tested.</p>
        <p class="serpina1-meaning">${safe(report.meaning)}</p>
        <ul class="serpina1-markers">${details}</ul>
        <p class="serpina1-caution">Consumer SNP data cannot determine whether you have this condition, detect every rare SERPINA1 variant, or replace clinical testing. If MyHeritage reported increased risk, a clinician can review the original report and consider alpha-1 antitrypsin blood levels, protein phenotyping and confirmatory genotyping.</p>
        <div class="serpina1-links"><a href="https://medlineplus.gov/genetics/condition/alpha-1-antitrypsin-deficiency/" target="_blank" rel="noopener noreferrer">NIH condition guide ↗</a><a href="https://journal.copdfoundation.org/jcopdf/id/1115" target="_blank" rel="noopener noreferrer">Clinical testing guidelines ↗</a></div>
      </div>
    </details>`;
  }
  const clinicalPanelHtml=`<div id="tab-panel-clinical" class="result-tab-panel" role="tabpanel" aria-labelledby="tab-clinical">${clinicalHtml}</div>`;
  const carrierPanelHtml=`<div id="tab-panel-carrier" class="result-tab-panel" role="tabpanel" aria-labelledby="tab-carrier"><div class="tab-panel-intro"><h3>Carrier information &amp; family planning</h3><p>A single disease-associated variant in a recessive gene may matter if a reproductive partner carries a disease-causing variant for the same condition. <strong>When both are confirmed carriers, each pregnancy typically has a 25% chance of an affected child.</strong> The variants need not be identical. These uploaded calls are <strong>not</strong> confirmed carrier-screening results or diagnoses. <a href="https://medlineplus.gov/genetics/understanding/inheritance/riskassessment/" target="_blank" rel="noopener noreferrer">How recessive inheritance works ↗</a></p></div></div>`;
  const researchPanelHtml=`<div id="tab-panel-research" class="result-tab-panel" role="tabpanel" aria-labelledby="tab-research"><div class="tab-panel-intro"><h3>Traits, nutrition &amp; research associations</h3><p>Genotype-specific educational findings from carefully selected sources, with their evidence and limitations. Some describe potentially useful traits, but a research association does not prove a personal benefit or health outcome. <a href="https://www.ebi.ac.uk/gwas/" target="_blank" rel="noopener noreferrer">Explore the NHGRI–EBI GWAS Catalog ↗</a></p></div>${curatedTable}</div>`;
  const benignPanelHtml=`<div id="tab-panel-benign" class="result-tab-panel" role="tabpanel" aria-labelledby="tab-benign"><div class="tab-panel-intro"><h3>Benign &amp; unreviewed variants</h3><p>A benign variant is not evidence of a disease, and does not automatically confer protection. Raw SNPs without an interpretation are shown for browsing, not as findings.</p></div>${otherTable?`<details class="raw-marker-section"><summary>Browse ${totalOther.toLocaleString()} unreviewed raw SNPs</summary>${otherTable}</details>`:''}</div>`;
  $('cards').innerHTML=clinicalPanelHtml+carrierPanelHtml+researchPanelHtml+benignPanelHtml;
  const clinicalSection=$('tab-panel-clinical').querySelector('.clinvar-section');
  const carrierSection=clinicalSection?.querySelector('.clinvar-secondary');
  const benignSection=clinicalSection?.querySelector('.clinvar-benign');
  if(carrierSection){$('tab-panel-carrier').append(carrierSection);carrierSection.open=true;}
  if(benignSection){$('tab-panel-benign').prepend(benignSection);benignSection.open=true;}
  const report=interpretSerpina1(records,window.__snpBuild);
  const [zCopy,sCopy]=report.markers.map(marker=>marker.alternateCopies||0);
  const specialClinicallyRelevant=zCopy===2||(zCopy>0&&sCopy>0);
  if(serpinaHtml){
    const section=document.createElement('div');
    section.innerHTML=serpinaHtml;
    const card=section.firstElementChild;
    if(card){
      // When both S and Z alternate alleles are found, put the codominant
      // overview above every individual ClinVar card. This is a review
      // priority, NOT a diagnosis or a calibrated disease-risk ranking.
      const bothSZDetected=zCopy>0&&sCopy>0;
      if(specialClinicallyRelevant&&bothSZDetected)$('tab-panel-clinical').prepend(card);
      else (specialClinicallyRelevant?$('tab-panel-clinical'):$('tab-panel-carrier')).append(card);
    }
  }
  if(!clinicalPrimaryCount&&!specialClinicallyRelevant)$('tab-panel-clinical').insertAdjacentHTML('beforeend','<p class="tab-empty">No variant-level ClinVar records in this review group match the current search. This does not rule out other variants or medical conditions.</p>');
  if(!clinicalCarrierCount&&!serpinaHtml)$('tab-panel-carrier').insertAdjacentHTML('beforeend','<p class="tab-empty">No provisional one-copy recessive findings match this search. This is not a negative carrier-screening result.</p>');
  $('tab-count-clinical').textContent=String(clinicalPrimaryCount+(specialClinicallyRelevant&&serpinaHtml?1:0));
  $('tab-count-carrier').textContent=String(clinicalCarrierCount+(serpinaHtml&&!specialClinicallyRelevant?1:0));
  $('tab-count-research').textContent=String(filtered.length);
  $('tab-count-benign').textContent=String(clinicalBenignCount);
  selectResultTab(activeResultTab);
  for(const el of $('cards').querySelectorAll('.clinvar-card')){
    if(openVariantKeys.has(el.getAttribute('data-variant-key')))el.open=true;
  }
  if(openBenign){const el=$('cards').querySelector('.clinvar-benign');if(el)el.open=true;}
  if(openOtherBenign){const el=$('cards').querySelector('.clinvar-benign-rest');if(el)el.open=true;}
  if(openRecessive){const el=$('cards').querySelector('.clinvar-secondary');if(el)el.open=true;}
  if(serpinaWasOpen!==null){const el=$('cards').querySelector('.serpina1-panel');if(el)el.open=serpinaWasOpen;}
}
function show(result,label){window.__snpBuild=result.build;records=result.records;mode=label;$('results').hidden=false;$('error').hidden=true;$('total').textContent=records.size.toLocaleString();refreshAnnotatedCount();$('nocalls').textContent=[...records.values()].filter(x=>isNoCall(x.genotype)).length.toLocaleString();updateInventoryCount();$('result-summary').textContent=`${label} · ${result.format}${result.build?' · Genome build '+result.build:''}. Showing curated interpretations; the marker inventory is separate.`;$('search').value='';$('filter').value='all';activeResultTab=preferredResultTab();draw();$('results').scrollIntoView({behavior:'smooth',block:'start'})}
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
for(const name of resultTabNames){
  const button=$('tab-'+name);
  button.addEventListener('click',()=>selectResultTab(name));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const current=resultTabNames.indexOf(name);
    const next=event.key==='Home'?0:event.key==='End'?resultTabNames.length-1:
      (current+(event.key==='ArrowRight'?1:-1)+resultTabNames.length)%resultTabNames.length;
    selectResultTab(resultTabNames[next],true);
  });
}
$('inventory-button').addEventListener('click',lookupInventory);
$('inventory-search').addEventListener('keydown',e=>{if(e.key==='Enter')lookupInventory()});
loadInventory();
loadClinvar();
$('context-age').addEventListener('input',updatePersonalContext);
$('context-sex').addEventListener('change',updatePersonalContext);
$('context-ancestry').addEventListener('change',updatePersonalContext);
updatePersonalContext();
const picker=$('file');
picker.addEventListener('change',()=>{const selected=picker.files?.[0];if(selected){$('upload-status').textContent=`Selected: ${selected.name}`;handle(selected)}});
['dragenter','dragover'].forEach(t=>$('drop').addEventListener(t,e=>{e.preventDefault();$('drop').classList.add('drag')}));['dragleave','drop'].forEach(t=>$('drop').addEventListener(t,e=>{e.preventDefault();$('drop').classList.remove('drag')}));$('drop').addEventListener('drop',e=>handle(e.dataTransfer.files[0]));$('demo').addEventListener('click',()=>show(parseDNA(demo),'Fictional sample genome'));$('search').addEventListener('input',draw);$('filter').addEventListener('change',draw);$('clear').addEventListener('click',()=>{records.clear();mode='';window.__snpBuild='';$('file').value='';$('context-age').value='';$('context-sex').value='';$('context-ancestry').value='';updatePersonalContext();$('results').hidden=true;$('upload').scrollIntoView({behavior:'smooth'})});$('export').addEventListener('click',()=>{const rows=[['rsID','gene','topic','genotype','interpretation','evidence_source']];for(const c of matches()){const g=c.call?.genotype||'';rows.push([c.id,c.gene,c.title,g,c.meaning,c.source])}const csv=rows.map(r=>r.map(s=>'"'+String(s).replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.href=url;a.download='snp-reader-curated-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
