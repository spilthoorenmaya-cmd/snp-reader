/**
 * Family-planning eye-colour EXPLORER (not a genetic prediction).
 * Personal inputs stay in memory, never sent to any service.
 * Source: https://medlineplus.gov/genetics/understanding/traits/eyecolor/
 */
const EYES={
  'dark-brown':'very dark brown',
  brown:'brown',
  hazel:'hazel',
  green:'green',
  blue:'blue',
  gray:'gray'
};
export const eyeColorOptions=Object.freeze(EYES);
export const herc2Marker=Object.freeze({
  id:'rs12913832',chr:'15',build37:28365618,build38:28120472,
  alleles:Object.freeze(['A','G'])
});

export function readEyeMarker(records,build){
  if(!(records instanceof Map))return {status:'missing',genotype:null};
  const call=records.get(herc2Marker.id);
  if(!call)return {status:'missing',genotype:null};
  const genotype=String(call.genotype??'').toUpperCase();
  const location=Number(call.pos);
  const chromosome=String(call.chr??'').replace(/^chr/i,'');
  if(!['37','38'].includes(String(build))||chromosome!==herc2Marker.chr||
    location!==(String(build)==='37'?herc2Marker.build37:herc2Marker.build38)||
    !/^[AG]{2}$/.test(genotype))
    return {status:'unverified',genotype:null};
  return {status:'checked',genotype:[...genotype].sort().join('')};
}

export function possibleChildMarkerGenotypes(parent,partner){
  if(!/^(AA|AG|GG)$/.test(String(parent))||!/^(AA|AG|GG)$/.test(String(partner)))
    return [];
  const combos=new Set();
  for(const a of parent)for(const b of partner)combos.add([a,b].sort().join(''));
  return ['AA','AG','GG'].filter(g=>combos.has(g));
}

/**
 * Visible eye colours are not genotypes. Even when both marker genotypes
 * are provided, NEVER return an eye-colour probability or risk estimate.
 */
export function exploreBabyEyeColor({parentEye='',partnerEye='',partnerMarker=''},ownMarker){
  const mine=Object.hasOwn(EYES,parentEye)?parentEye:'';
  const theirs=Object.hasOwn(EYES,partnerEye)?partnerEye:'';
  const marker=ownMarker?.status==='checked'?ownMarker.genotype:null;
  const validPartner=/^(AA|AG|GG)$/.test(partnerMarker)?partnerMarker:'';
  const offspring=possibleChildMarkerGenotypes(marker,validPartner);
  const hasColors=Boolean(mine&&theirs);
  const headline=hasColors
    ? (mine==='green'||theirs==='green'
      ? 'Yes, a green-eyed child is possible!'
      : 'Green eyes can still be possible.')
    : 'Could your baby have green eyes? Possibly!';
  const narrative=hasColors
    ? 'One parent has '+EYES[mine]+' eyes and the other has '+EYES[theirs]+' eyes. Eye colour comes from many genes, so the combination cannot rule out green, hazel, brown or blue eyes, or reliably predict which one a child will have.'
    : 'Select your eye colour and your partner’s to explore why different eye colours can appear in the same family.';
  const markerText=marker
    ? 'Your verified raw-file call at HERC2 rs12913832 is '+marker+'. This variant helps influence light versus dark pigmentation, but cannot tell us your baby’s eye colour on its own.'
    : ownMarker?.status==='unverified'
      ? 'An rs12913832 row was found, but its genome-build position or alleles could not be verified. It is not used for inheritance examples.'
      : 'Your uploaded file does not contain a verified rs12913832 call. This is common with incomplete consumer genotyping; absence is not a result.';
  const inheritance=offspring.length
    ? 'Using just rs12913832, possible child genotypes from your '+marker+' and your partner’s '+validPartner+' are '+offspring.join(', ')+'. These are possible inherited letters, NOT possible eye-colour predictions or percentages.'
    : validPartner
      ? 'Your partner’s entered HERC2 genotype is '+validPartner+'; a compatible, verified genotype for you is also needed to illustrate the child’s possible letter pairs.'
      : 'Green-eyed appearance does not tell us which HERC2 alleles your partner carries. You can optionally enter a verified HERC2 genotype for a one-marker inheritance illustration.';
  return {headline,narrative,markerText,inheritance,offspring,hasColors};
}
