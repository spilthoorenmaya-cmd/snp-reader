import {matchGwas} from './gwas-matching.js';

/** Research discovery only: never produce a neurodevelopmental diagnosis. */
export function isNeurodevelopmentStudy(entry) {
  const trait=String(entry?.trait||'').trim().toLowerCase();
  // Avoid combined cross-disorder phenotypes and "versus" comparisons that
  // cannot be represented accurately as a condition-specific association.
  if (/\b(combined|versus|vs\.?|cross.disorder|interaction)\b/.test(trait)) return false;
  return /^(autism(?: spectrum disorder)?|attention.deficit(?:\/hyperactivity| hyperactivity)? disorder|adhd)\b/.test(trait);
}

export function neurodevelopmentMatches(records,entries,limit=40) {
  return matchGwas(records,entries.filter(isNeurodevelopmentStudy),limit);
}

/** Return allele-level reference lookups, never personal ancestry estimates. */
export function populationReferenceMatches(records,entries,limit=12) {
  const matched=matchGwas(records,entries,Number.MAX_SAFE_INTEGER);
  const seen=new Set();
  const result=[];
  for(const row of matched){
    const key=row.rsid+':'+row.effectAllele;
    if(seen.has(key)) continue;
    seen.add(key);
    result.push({rsid:row.rsid,allele:row.effectAllele});
    if(result.length>=limit) break;
  }
  return result;
}

export function ensemblVariantUrl(rsid) {
  return /^rs[1-9][0-9]*$/.test(rsid)
    ? 'https://www.ensembl.org/Homo_sapiens/Variation/Explore?v='+rsid
    : null;
}
