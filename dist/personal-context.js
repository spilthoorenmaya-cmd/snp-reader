/**
 * Optional, self-reported context for educational explanations ONLY.
 * Never infer these fields from SNPs, store them, send them to a server,
 * calculate cancer probabilities, or reclassify a ClinVar assertion.
 */
const SEX={
  female:'Female at birth',
  male:'Male at birth',
  intersex:'Intersex / variation in sex characteristics',
  undisclosed:'Prefer not to say'
};
const ANCESTRY={
  european:'European',
  african:'African',
  east_asian:'East Asian',
  south_asian:'South Asian',
  west_asian:'West Asian / Middle Eastern',
  latin_american:'Latin American',
  indigenous_american:'Indigenous American',
  oceanian:'Oceanian / Pacific Islander',
  multiple:'Multiple / mixed backgrounds',
  unsure:'Not sure',
  undisclosed:'Prefer not to say'
};
export const contextSexOptions=Object.freeze(SEX);
export const contextAncestryOptions=Object.freeze(ANCESTRY);

export function normalizePersonalContext(input={}){
  const rawAge=String(input.age??'').trim();
  const age=rawAge!==''&&/^\d{1,3}$/.test(rawAge)&&Number(rawAge)<=120
    ? Number(rawAge):null;
  const sex=Object.hasOwn(SEX,input.sex)?input.sex:'';
  const ancestry=Object.hasOwn(ANCESTRY,input.ancestry)?input.ancestry:'';
  return {age,sex,ancestry};
}
export function hasPersonalContext(context){
  const c=normalizePersonalContext(context);
  return c.age!==null || (c.sex&&c.sex!=='undisclosed') || (c.ancestry&&c.ancestry!=='undisclosed');
}
export function personalContextSummary(context){
  const c=normalizePersonalContext(context),parts=[];
  if(c.age!==null)parts.push('Age: '+c.age);
  if(c.sex&&c.sex!=='undisclosed')parts.push('Sex assigned at birth: '+SEX[c.sex]);
  if(c.ancestry&&c.ancestry!=='undisclosed')parts.push('Self-described ancestry: '+ANCESTRY[c.ancestry]);
  return parts.length?parts.join(' · '):'No personal context selected. All genetic evidence remains available.';
}
/**
 * Explain limits when reviewing a condition, using only optional self-report.
 * This function must never produce a numeric risk, label a user as high/low
 * risk, or claim a genetic disorder is present/absent.
 */
export function conditionContextNote(conditions,context){
  const c=normalizePersonalContext(context);
  if(!hasPersonalContext(c))return '';
  const text=(Array.isArray(conditions)?conditions:[conditions]).join(' ').toLowerCase();
  const cancer=/\b(?:cancer|carcinoma|neoplasm|tumou?r|breast.ovarian|brca)\b/.test(text);
  const notes=[];
  if(c.age!==null){
    notes.push(cancer
      ? 'Age matters for population cancer rates and clinical screening discussions, but your age is not used to calculate a risk score here.'
      : 'Age can influence how some conditions are evaluated, but it does not change the DNA variant call.');
  }
  if(c.sex&&c.sex!=='undisclosed'){
    notes.push(cancer
      ? 'Sex-related anatomy, hormones and personal history can matter for cancer screening. Sex assigned at birth alone cannot establish which screening applies to you.'
      : 'Sex-related biology can matter for some conditions, but this selection does not change variant classification.');
  }
  if(c.ancestry&&c.ancestry!=='undisclosed'){
    notes.push('Genetic studies may have unequal representation across ancestries. Self-described background is not a genetic-ancestry measurement or a calibrated prediction.');
  }
  return notes.join(' ');
}
