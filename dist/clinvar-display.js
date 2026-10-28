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
  if(classification.includes('benign'))return 'Benign evidence reported';
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
/**
 * A phenotype NAME mentioning an inheritance pattern is a clue, not a
 * variant-specific molecular diagnosis. Do not assign mode of inheritance
 * for X-linked or mixed-pattern names from a two-letter consumer genotype.
 */
export function inheritancePattern(raw) {
  const names=conditionLabels(raw);
  if(names.some(x=>/\b(?:x.linked|y.linked|mitochondrial)\b/i.test(x)))return 'complex';
  const recessive=names.some(x=>/\b(?:autosomal\s+)?recessive\b/i.test(x));
  const dominant=names.some(x=>/\b(?:autosomal\s+)?dominant\b/i.test(x));
  if(recessive&&dominant)return 'mixed';
  if(recessive)return 'recessive';
  if(dominant)return 'dominant';
  return 'unknown';
}

/** Plain language about COPY NUMBER, not an assertion of having a disease. */
export function inheritanceBrief(raw,alternateCopies) {
  const pattern=inheritancePattern(raw);
  if(pattern==='recessive'&&alternateCopies===1)return {
    heading:'You have one alternate copy; recessive conditions typically require two affected gene copies.',
    detail:'The changes could be at different positions, but would generally need to affect opposite copies of the gene. Two variants on the same copy do not make two affected copies. This SNP-chip upload cannot establish that, detect all variants, or confirm carrier status.'
  };
  if(pattern==='recessive'&&alternateCopies===2)return {
    heading:'You have two copies of this alternate allele.',
    detail:'Two disease-associated gene copies may matter for a recessive condition, but a matching consumer DNA call cannot establish that you have the condition.'
  };
  if(pattern==='dominant'&&alternateCopies>=1)return {
    heading:alternateCopies===1?'You have one alternate copy; one can matter in some dominant conditions.':'You have two alternate copies; dominant conditions can be relevant with just one.',
    detail:'An alternate allele is not proof of illness. The particular gene, variant, condition, penetrance and clinical confirmation determine its significance.'
  };
  if(pattern==='mixed')return {
    heading:'The listed conditions have more than one inheritance pattern.',
    detail:'Some may be recessive and others dominant. This record alone cannot determine which rule, if any, applies to your genotype.'
  };
  return {
    heading:'Copy count alone cannot tell whether you would be affected.',
    detail:'This record does not provide verified, condition-specific inheritance information. One copy may or may not matter depending on the variant and condition.'
  };
}
export function inheritanceContext(raw,alternateCopies) {
  const pattern=inheritancePattern(raw);
  if(pattern==='recessive'&&alternateCopies===1)
    return 'A listed condition name mentions recessive inheritance. You have only one alternate copy at this marker. A typical autosomal recessive disorder requires disease-associated changes in both copies of the gene; two different variants must generally be on opposite chromosome copies (in trans), not together on one (in cis). This file cannot identify all gene variants, establish their phase, or confirm carrier status.';
  if(pattern==='recessive')
    return 'A listed condition name mentions recessive inheritance. Two copies of a disease-associated change may be relevant, but the genotype does not establish a clinical diagnosis.';
  if(pattern==='dominant')
    return 'A listed condition name mentions dominant inheritance. One disease-associated copy can matter, but not everyone with such a variant is affected. This record alone is not a diagnosis.';
  if(pattern==='mixed')
    return 'The condition names mention both recessive and dominant inheritance. There is no one copy-number rule that fits them all.';
  return 'The clinical consequence of one versus two copies cannot be determined from this record alone. Condition-specific evidence is needed.';
}

/**
 * Conservative display grouping only. This does NOT determine true inheritance
 * or carrier status. Actual modes need condition-specific curated evidence.
 * For one-copy recessive-pattern findings with no dominant or X-linked
 * indication in the names, group under a collapsed "review separately" area.
 * Never silently drop a variant.
 */
export function clinicalDisplayGroup(e, alternateCopies) {
  if (alternateCopies !== 1) return 'main';
  if (!/^(Pathogenic|Likely pathogenic|Pathogenic\/Likely pathogenic)$/i.test(String(e?.sig || ''))) return 'main';
  if (!/^(?:[1-9]|1\d|2[0-2])$/.test(String(e?.chr || '').replace(/^chr/i,''))) return 'main';
  const names=conditionLabels(e?.condition);
  const hasRecessive=names.some(name=>/\b(?:autosomal\s+)?recessive\b/i.test(name));
  const hasDominant=names.some(name=>/\b(?:autosomal\s+)?dominant\b/i.test(name));
  const hasOtherPatterns=names.some(name=>/\b(?:x.linked|y.linked|mitochondrial)\b/i.test(name));
  return hasRecessive&&!hasDominant&&!hasOtherPatterns ? 'one-copy-recessive' : 'main';
}
