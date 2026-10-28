/** Readable, non-diagnostic ClinVar display metadata.
 * Clinical classification and condition names are shown as ClinVar records them.
 * Descriptions here never infer an individual's diagnosis.
 */
export function conditionLabels(raw) {
  const pieces = String(raw ?? '').split('|');
  const seen = new Set();
  const labels = [];
  for (const value of pieces) {
    const label = value.trim().replace(/\s+/g, ' ');
    const key = label.toLowerCase();
    if (!label || /^(not provided|not specified|not applicable|na|n\/a|none|-)$/i.test(label) || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels.length ? labels : ['Condition not specified'];
}
export function classificationTone(value) {
  const text = String(value || '').toLowerCase();
  // Conflicting classifications are NOT a pathogenic classification.
  if (text.includes('uncertain') || text.includes('conflicting')) return 'uncertain';
  if (text.includes('pathogenic')) return 'pathogenic';
  if (text.includes('benign')) return 'benign';
  return 'neutral';
}
export function reviewLabel(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'reviewed by expert panel') return 'Reviewed by expert panel';
  if (text === 'practice guideline') return 'Practice guideline';
  if (text.includes('multiple submitters')) return 'Multiple submitters, no conflicts';
  if (text.includes('single submitter')) return 'Single submitter';
  return String(value || 'Review status not provided');
}

/**
 * SNP Reader uses a neutral headline without changing the ClinVar assertion:
 * "Pathogenic" and "Likely pathogenic" are different formal evidence terms.
 * Display the exact ClinVar term only in expandable source evidence.
 */
export function classificationHeadline(value) {
  const classification=String(value || '').toLowerCase();
  if(classification.includes('conflicting'))return 'Mixed research classifications';
  if(classification.includes('uncertain'))return 'Clinical meaning uncertain';
  if(classification.includes('benign'))return 'Reported as likely harmless';
  if(classification.includes('pathogenic'))return 'Clinical evidence available';
  return 'Research evidence available';
}

export function genotypeAlleleContext(call,evidence) {
  const genotype=String(call?.genotype||'').toUpperCase();
  const ref=String(evidence?.ref||'').toUpperCase();
  const alt=String(evidence?.alt||'').toUpperCase();
  if(!/^[ACGT]{2}$/.test(genotype)||!/^[ACGT]$/.test(ref)||!/^[ACGT]$/.test(alt)||ref===alt||
     ![...genotype].every(x=>x===ref||x===alt))return null;
  const alternateCopies=[...genotype].filter(x=>x===alt).length;
  const referenceCopies=2-alternateCopies;
  const copyMessage=alternateCopies===0
    ? 'No copies of the alternate allele were identified at this marker in the uploaded file. This does not exclude other genetic findings.'
    : alternateCopies===1
    ? 'One copy of the alternate allele was detected (heterozygous). Whether one copy has a clinical effect depends on the specific condition and its inheritance pattern.'
    : 'Two copies of the alternate allele were detected (homozygous). This can be important for some recessive conditions, but does not establish a diagnosis.';
  return {ref,alt,referenceCopies,alternateCopies,copyMessage};
}
export function inheritanceContext(raw,alternateCopies) {
  // A ClinVar PhenotypeList is a list of names, not authoritative per-variant
  // mode-of-inheritance data. Present any inheritance hints as educational only.
  const names=conditionLabels(raw);
  const recessive=names.some(x=>/\b(?:autosomal\s+)?recessive\b/i.test(x));
  const dominant=names.some(x=>/\b(?:autosomal\s+)?dominant\b/i.test(x));
  if(recessive&&dominant)return 'The condition names mention both recessive and dominant inheritance. One general copy-number rule cannot explain all of them; review the specific variant–condition record.';
  if(recessive)return alternateCopies===1
    ? 'A listed condition name mentions recessive inheritance. One variant copy alone usually does not cause a recessive disorder, but this test cannot rule out a second variant.'
    : 'A listed condition name mentions recessive inheritance. Two copies may be relevant for some recessive conditions; this call is not a clinical diagnosis.';
  if(dominant)return 'A listed condition name mentions dominant inheritance. One copy can matter for some dominant conditions, but this record alone does not establish an effect, penetrance, or diagnosis.';
  return 'The clinical consequence of one versus two copies cannot be determined from this record alone. Condition-specific inheritance and penetrance matter.';
}
