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

/**
 * Carefully bounded GENERAL definitions, not inferred symptoms or a diagnosis.
 * Wording is based on broad clinical terminology. Never derive phenotype from
 * an rsID, genotype, or a condition-name fragment alone.
 */
export function conditionBrief(raw) {
  const name=conditionLabels(raw)[0];
  const n=name.toLowerCase();
  const definitions=[
    [/\bbreast.ovarian cancer\b|\bhereditary breast and ovarian cancer\b/i,
      'A hereditary cancer susceptibility syndrome. Some specific BRCA1 or BRCA2 variants can increase cancer risk, but many variants in these genes are benign.'],
    [/\b(?:nonsyndromic )?(?:sensorineural )?hearing loss\b|\bdeafness\b/i,
      'A condition involving reduced hearing. Some inherited forms occur without other characteristic symptoms.'],
    [/\bcystic fibrosis\b/i,
      'An inherited condition that affects mucus production, particularly in the lungs and digestive system.'],
    [/\b(?:hereditary )?hemochromatosis\b/i,
      'A condition that may cause excess iron to accumulate in the body over time.'],
    [/\bfamilial hypercholesterolemia\b/i,
      'An inherited tendency to have unusually high LDL cholesterol levels.'],
    [/\b(?:alpha|beta)[ -]thalass(?:a)?emia\b/i,
      'An inherited blood condition that affects production of hemoglobin, which carries oxygen.'],
    [/\bsickle.cell (?:disease|anemia|anaemia)\b/i,
      'An inherited condition affecting red blood cells and their ability to carry oxygen.'],
    [/\blong qt syndrome\b/i,
      'An inherited or acquired condition involving the electrical timing of the heartbeat.'],
    [/\bhypertrophic cardiomyopathy\b/i,
      'A condition in which the heart muscle becomes abnormally thick.'],
    [/\bfactor v leiden\b|\bthrombophilia\b/i,
      'A condition associated with an increased tendency for blood to form clots.'],
    [/\blynch syndrome\b/i,
      'An inherited predisposition that can raise the risk of certain cancers.'],
    [/\bphenylketonuria\b|\b(?:^| )pku\b/i,
      'An inherited metabolic condition affecting how the body processes phenylalanine.']
  ];
  const matched=definitions.find(([pattern])=>pattern.test(n));
  return matched ? {text:matched[1],specific:true} : {
    text:'This is the condition name recorded alongside the variant in ClinVar. See the source record for its clinical description.',
    specific:false
  };
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
  const zygosity=alternateCopies===2?'Homozygous alternate':alternateCopies===1?'Heterozygous':'Homozygous reference';
  const isAutosomal=/^(?:[1-9]|1\d|2[0-2])$/.test(String(evidence?.chr||'').replace(/^chr/i,''));
  const copyMessage=alternateCopies===0
    ? 'No copies of the alternate allele were identified at this marker in the uploaded file. This does not exclude other genetic findings.'
    : alternateCopies===1
    ? 'One copy of the alternate allele was detected (heterozygous). Whether one copy has a clinical effect depends on the specific condition and its inheritance pattern.'
    : 'Two copies of the alternate allele were detected (homozygous). This can be important for some recessive conditions, but does not establish a diagnosis.';
  return {ref,alt,referenceCopies,alternateCopies,zygosity,isAutosomal,copyMessage};
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


/**
 * Visual categories are derived ONLY from wording in ClinVar condition names.
 * They are NOT independently validated, variant-specific inheritance modes.
 * Keep the UI explicit so colors cannot be confused with disease risk.
 */
export function inheritanceDisplay(raw) {
  const pattern=inheritancePattern(raw);
  switch(pattern){
    case 'recessive': return {
      tone:'recessive',label:'Recessive pattern mentioned',
      description:'Conditions of this type generally need changes affecting both gene copies.'
    };
    case 'dominant': return {
      tone:'dominant',label:'Dominant pattern mentioned',
      description:'For some conditions of this type, one disease-associated copy can matter.'
    };
    case 'mixed': return {
      tone:'review',label:'Mixed inheritance patterns',
      description:'Different conditions in this record mention different inheritance rules.'
    };
    case 'complex': return {
      tone:'review',label:'Special inheritance mentioned',
      description:'X-linked, Y-linked or mitochondrial patterns need a different interpretation.'
    };
    default: return {
      tone:'unspecified',label:'Inheritance not specified',
      description:'This condition name does not establish how many copies matter.'
    };
  }
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
/**
 * Meaning of alternate-copy count relative to an evidence classification.
 * Two alternate calls are an observation, not a disease diagnosis; benign
 * variants must never be presented as disease evidence.
 */
export function alleleDoseSummary(raw, alternateCopies, significance, chromosome) {
  const pattern=inheritancePattern(raw);
  const sig=String(significance||'').toLowerCase();
  const isBenign=sig.includes('benign');
  const isUncertain=sig.includes('uncertain')||sig.includes('conflicting');
  const isDiseaseAssociated=sig.includes('pathogenic')&&!isUncertain&&!isBenign;
  const isAutosomal=/^(?:[1-9]|1\d|2[0-2])$/.test(String(chromosome||'').replace(/^chr/i,''));
  if(!isAutosomal)return {
    type:'review',
    heading:'Copy count needs chromosome-specific interpretation',
    detail:'A two-letter genotype on a sex chromosome or mitochondrial marker is not reliable proof of two gene copies. Check the exact variant and clinical context.'
  };
  if(alternateCopies===0)return {
    type:'reference',
    heading:'No alternate allele detected here',
    detail:'This does not rule out variants elsewhere in the gene or an inherited condition.'
  };
  if(isBenign)return {
    type:'benign',
    heading:'Benign variant — not evidence of the listed disease',
    detail:alternateCopies===2
      ? 'Your genotype has two copies of this alternate allele, but ClinVar considers this particular variant benign or likely benign for the listed condition. Two copies do not turn a benign variant into disease evidence. This does not assess the whole gene.'
      : 'Your genotype has one copy of this alternate allele, which ClinVar considers benign or likely benign for the listed condition. The classification concerns this variant only, not the whole gene.'
  };
  if(isUncertain)return {
    type:'review',
    heading:alternateCopies===2?'Two alternate copies; clinical significance is unresolved':'One alternate copy; clinical significance is unresolved',
    detail:'The source classification is uncertain or conflicting. Copy count alone cannot resolve whether the variant causes a condition.'
  };
  if(pattern==='recessive'&&alternateCopies===2)return {
    type:'two-copy',
    heading:'Two alternate copies: potentially relevant to a recessive condition',
    detail:isDiseaseAssociated
      ? 'ClinVar reports a disease-associated classification for this variant. Homozygous calls can be relevant to some recessive conditions, but SNP-chip results require clinical confirmation and do not establish a diagnosis.'
      : 'The evidence does not establish that this variant causes disease. Two copies alone cannot establish a diagnosis.'
  };
  if(pattern==='recessive'&&alternateCopies===1)return {
    type:'carrier',
    heading:'One alternate copy: usually insufficient alone for a recessive condition',
    detail:'A recessive condition generally requires changes affecting both copies of the gene. A different second variant may be untested; this does not confirm carrier status or rule out the condition.'
  };
  if(pattern==='dominant'&&alternateCopies>=1)return {
    type:'dominant',
    heading:alternateCopies===2?'Two alternate copies: a dominant pattern does not require two':'One alternate copy: may matter for a dominant condition',
    detail:'Some dominant conditions can be associated with one disease-associated gene copy, but the source classification, penetrance and clinical confirmation determine any significance.'
  };
  return {
    type:'review',
    heading:alternateCopies===2?'Two alternate copies detected':'One alternate copy detected',
    detail:'The source does not establish a single inheritance rule for this record. Copy count alone cannot tell whether the variant affects health.'
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
 * A curated exception to name-based recessive detection: ClinVar often uses
 * just "cystic fibrosis" or "mucoviscidosis" without spelling out
 * "autosomal recessive". Do NOT generalize all CFTR records: the variant
 * must still be a pathogenic classification for THAT condition.
 */
export function isCysticFibrosisCondition(e) {
  if(String(e?.gene||'').trim().toUpperCase()!=='CFTR')return false;
  return conditionLabels(e?.condition).some(name=>
    /\b(?:cystic fibrosis|mucoviscidosis|mucoviscidose)\b/i.test(name));
}

/** Education about partner testing; not an individual reproductive risk score. */
export function carrierPlanningNote(e,alternateCopies) {
  if(clinicalDisplayGroup(e,alternateCopies)!=='one-copy-recessive')return null;
  const cysticFibrosis=isCysticFibrosisCondition(e);
  return cysticFibrosis
    ? {
      title:'Possible cystic fibrosis carrier-related finding · not confirmed',
      message:'One alternate copy of a CFTR variant classified as pathogenic for cystic fibrosis was detected. This does not mean you have cystic fibrosis or confirm that you are a carrier. Some CFTR variants have condition-specific effects, so clinical confirmation matters.',
      partner:'If you and a reproductive partner are both confirmed carriers of CFTR variants that can cause cystic fibrosis together, each pregnancy typically has a 1 in 4 (25%) chance of an affected child. The two variants do not need to be identical.',
      action:'If planning children, discuss clinical CFTR carrier screening for you and your partner with a qualified professional. Raw DNA files do not test every variant.',
      source:'https://www.cff.org/intro-cf/cf-genetics-basics'
    }
    : {
      title:'Possible recessive carrier-related finding · not confirmed',
      message:'One alternate copy was detected for a variant classified as pathogenic for a condition with a recessive inheritance label. This is not a diagnosis or a confirmed carrier-screening result.',
      partner:'If you and a reproductive partner are both confirmed carriers of variants that cause the same autosomal recessive condition, each pregnancy typically has a 1 in 4 (25%) chance of an affected child. Your variants do not necessarily have to be identical.',
      action:'Consider clinical carrier screening and genetic counseling when planning a pregnancy. Another gene variant may be missing from consumer raw DNA data.',
      source:'https://medlineplus.gov/genetics/understanding/inheritance/riskassessment/'
    };
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
  const hasRecessive=names.some(name=>/\b(?:autosomal\s+)?recessive\b/i.test(name))||isCysticFibrosisCondition(e);
  const hasDominant=names.some(name=>/\b(?:autosomal\s+)?dominant\b/i.test(name));
  const hasOtherPatterns=names.some(name=>/\b(?:x.linked|y.linked|mitochondrial)\b/i.test(name));
  return hasRecessive&&!hasDominant&&!hasOtherPatterns ? 'one-copy-recessive' : 'main';
}
