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
