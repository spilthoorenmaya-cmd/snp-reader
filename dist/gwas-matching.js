/** GWAS Catalog evidence is research, never a clinical diagnosis. */
export function matchGwas(records, entries, limit=150) {
  if (!(records instanceof Map) || !Array.isArray(entries)) return [];
  const matches=[];
  for (const entry of entries) {
    if (matches.length>=limit) break;
    const call=records.get(entry.rsid);
    if (!call) continue;
    const genotype=String(call.genotype||'').toUpperCase();
    const effect=String(entry.effectAllele||'').toUpperCase();
    const alleleValid=/^[ACGT]$/.test(effect);
    const genotypeValid=/^[ACGT]{2}$/.test(genotype);
    // GWAS Catalog's risk allele often has no unambiguous strand/build.
    // Never infer a personal effect when allele orientation is not validated.
    matches.push({
      ...entry, genotype,
      alleleCopies: null,
      status: alleleValid&&genotypeValid?'research-only':'identifier-only',
      explanation: 'This rsID occurs in a published association. Allele orientation and genome-build compatibility have not been independently validated; no personal effect or risk is inferred.'
    });
  }
  return matches;
}
