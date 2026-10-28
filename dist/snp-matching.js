/**
 * Strict SNP/evidence matching, shared by the UI and Node regression tests.
 * Raw unphased calls are normalized; evidence never implies diagnosis.
 */
import {isCalledDiploidSnp, normalizeChromosome, normalizeGenotype} from './dna-parser.js';

export function curatedMatches(records, catalog) {
  return catalog.flatMap(entry => {
    const call = records.get(entry.id);
    if (!call) return [];
    const genotype = normalizeGenotype(call.genotype);
    const alleles = entry.alleles;
    const valid = Boolean(genotype && isCalledDiploidSnp(genotype)
      && alleles?.length === 2 && [...genotype].every(a => alleles.includes(a)));
    return [{...entry, call, valid, meaning: valid ? entry.interpret(genotype) :
      'Unresolved genotype or allele representation; no interpretation is provided.'}];
  });
}
export function matchClinvar(records, evidence, build) {
  // We never infer assembly from coordinate alone: GRCh37 and GRCh38 are distinct.
  if (build !== '37' && build !== '38' || !Array.isArray(evidence)) return [];
  const assembly = build === '37' ? 'GRCh37' : 'GRCh38';
  const hits = [], seen = new Set();
  for (const e of evidence) {
    if (!e || e.build !== assembly || !/^rs[1-9]\d*$/i.test(e.id ?? '')) continue;
    const call = records.get(e.id.toLowerCase());
    if (!call || !isCalledDiploidSnp(call.genotype)) continue;
    if (normalizeChromosome(call.chr) !== normalizeChromosome(e.chr)) continue;
    if (!Number.isSafeInteger(Number(call.pos)) || Number(call.pos) !== e.pos) continue;
    const ref = String(e.ref || '').toUpperCase(), alt = String(e.alt || '').toUpperCase();
    if (!/^[ACGT]$/.test(ref) || !/^[ACGT]$/.test(alt) || ref === alt) continue;
    const genotype = normalizeGenotype(call.genotype);
    if (![...genotype].every(a => a === ref || a === alt) || !genotype.includes(alt)) continue;
    // Duplicate observations of the same ClinVar assertion are displayed once.
    const key = [e.id, e.build, e.chr, e.pos, ref, alt, e.variation, e.sig].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({e, call});
  }
  return hits;
}
