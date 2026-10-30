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
    // Only show associations with an explicitly reported, single-base allele
    // present in a called diploid genotype. Unknown alleles and no-calls fail
    // closed; rsID overlap by itself is not an allele match.
    if (!/^[ACGT]$/.test(effect) || !/^[ACGT]{2}$/.test(genotype) || !genotype.includes(effect)) continue;
    // Strand/build have not been independently validated. This is only a
    // letter-level overlap, not an inferred effect or personal risk.
    matches.push({
      ...entry, genotype,
      alleleCopies: null,
      status: 'research-only',
      explanation: 'The reported study allele is present in your local call. Allele orientation and genome-build compatibility have not been independently validated; no personal effect or risk is inferred.'
    });
  }
  return matches;
}
