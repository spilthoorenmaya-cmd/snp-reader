/**
 * SERPINA1 / alpha-1 antitrypsin: educational check of the common S and Z
 * marker alleles. Genomic PLUS-strand alleles/coordinates from ClinVar.
 *
 * This does not reconstruct complete PI haplotypes, detect rare/null variants,
 * infer phase, or diagnose deficiency. AAT protein/Pi typing and clinical
 * follow-up are distinct from a consumer SNP-chip call.
 */
export const SERPINA1_MARKERS=Object.freeze([
  Object.freeze({
    id:'rs28929474',name:'Z (PI*Z)',ref:'C',alt:'T',chr:'14',
    grch37:94844947,grch38:94378610,clinvar:17967
  }),
  Object.freeze({
    id:'rs17580',name:'S (PI*S)',ref:'T',alt:'A',chr:'14',
    grch37:94847262,grch38:94380925,clinvar:17969
  })
]);
const normalizeChr=value=>String(value??'').replace(/^chr/i,'').trim().toUpperCase();
export function checkSerpina1Marker(records, build, marker){
  const call=records.get(marker.id);
  const base={...marker,call:call?.genotype??null,alternateCopies:null};
  if(!call)return {...base,status:'not-tested',description:'Not present in this DNA export; not a negative result.'};
  const genotype=String(call.genotype??'').toUpperCase();
  if(genotype==='--'||genotype==='00')return {...base,status:'no-call',description:'The file reports no genotype here.'};
  if(build!=='37'&&build!=='38')return {...base,status:'unverified',description:'Genome build not specified; cannot safely verify this call.'};
  const position=build==='37'?marker.grch37:marker.grch38;
  if(normalizeChr(call.chr)!==marker.chr||Number(call.pos)!==position)
    return {...base,status:'unverified',description:'Coordinates do not match the reference build; not interpreted.'};
  if(!/^[ACGT]{2}$/.test(genotype)||![...genotype].every(base=>base===marker.ref||base===marker.alt))
    return {...base,status:'unverified',description:'Genotype alleles do not match the expected reference/alternate alleles.'};
  const alternateCopies=[...genotype].filter(a=>a===marker.alt).length;
  return {...base,status:'checked',alternateCopies,
    description:alternateCopies===0?'No '+marker.name+' allele detected at this position.'
      :alternateCopies===1?'One '+marker.name+' allele detected at this position.'
      :'Two '+marker.name+' alleles detected at this position.'};
}
export function interpretSerpina1(records,build){
  const markers=SERPINA1_MARKERS.map(m=>checkSerpina1Marker(records,build,m));
  const [z,s]=markers;
  const checked=markers.filter(m=>m.status==='checked');
  const complete=checked.length===2;
  const nZ=z.alternateCopies??0,nS=s.alternateCopies??0;
  const coverage=complete?'Both common markers checked':'Incomplete marker coverage';
  let heading,meaning,tone;
  if(nZ===2){
    heading='Two Z alleles detected at the tested Z marker';
    meaning='This genotype can be associated with substantially reduced alpha-1 antitrypsin. It is not a diagnosis and needs independent clinical confirmation, including assessment for other variants and appropriate testing.';
    tone='review';
  }else if(nZ>=1&&nS>=1&&complete){
    heading='Both an S allele and a Z allele detected';
    meaning='This pattern may be compatible with an SZ combination, but an unphased consumer file cannot prove the variants lie on opposite gene copies. Clinical confirmation and assessment of alpha-1 antitrypsin are appropriate.';
    tone='review';
  }else if(nZ===1){
    heading='One Z allele detected';
    meaning='One Z allele can reduce alpha-1 antitrypsin levels and may matter especially alongside smoking or another SERPINA1 variant. A single marker cannot establish the full gene combination or a diagnosis.';
    tone='information';
  }else if(nS===2){
    heading='Two S alleles detected at the tested S marker';
    meaning='The S allele usually has a milder effect than Z. Two S calls do not by themselves establish a clinically important deficiency or a whole-gene result.';
    tone='information';
  }else if(nS===1){
    heading='One S allele detected';
    meaning='The S allele generally has a milder effect than Z. One S call alone usually has limited clinical impact, but the rest of the SERPINA1 gene has not been fully evaluated.';
    tone='information';
  }else if(complete){
    heading='Neither common S nor Z variant detected';
    meaning='These two common variants were not detected at the checked positions. That does not exclude other SERPINA1 variants, alpha-1 antitrypsin deficiency, or an independent clinical risk report.';
    tone='neutral';
  }else{
    heading='Alpha-1 antitrypsin: not fully assessed';
    meaning='The uploaded file does not provide usable results for both common S and Z markers. A missing or unverified call cannot be treated as a negative result.';
    tone='neutral';
  }
  return {gene:'SERPINA1',heading,meaning,tone,coverage,complete,markers,
    source:'https://medlineplus.gov/genetics/condition/alpha-1-antitrypsin-deficiency/'};
}
