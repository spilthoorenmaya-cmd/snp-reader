/**
 * Benign records are very common and not a list of disease findings.
 * Choose ONE illustrative record for an expandable summary. Never label
 * the chosen example as the "best", "most protective", or a gene-wide test.
 *
 * Prefer clearer ClinVar review history, then preserve incoming order.
 * All other records remain accessible, with their original evidence.
 */
export function selectBenignExample(records){
  const items=Array.isArray(records)?records:[];
  if(!items.length)return {example:null,remaining:[]};
  const quality=item=>{
    const review=String(item?.e?.review||'').toLowerCase();
    if(review.includes('practice guideline'))return 5;
    if(review.includes('expert panel'))return 4;
    if(review.includes('multiple submitters')&&!review.includes('conflict'))return 3;
    if(review.includes('single submitter'))return 2;
    return 1;
  };
  let best=0;
  for(let i=1;i<items.length;i++){
    if(quality(items[i])>quality(items[best]))best=i;
  }
  return {example:items[best],remaining:items.filter((_,i)=>i!==best)};
}
