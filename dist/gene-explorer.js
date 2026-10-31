/** Evidence-linked gene discovery, not genome-wide gene annotation. */
export function explorableGenes(curated,clinvar,limit=30) {
  const found=new Map();
  const add=(gene,rsid,source)=>{
    if(!/^[A-Z0-9][A-Z0-9.-]{1,24}$/.test(gene)||!/^rs[1-9][0-9]*$/.test(rsid))return;
    let row=found.get(gene);
    if(!row){row={gene,markers:new Set(),sources:new Set()};found.set(gene,row);}
    row.markers.add(rsid);row.sources.add(source);
  };
  for(const hit of curated||[]){
    if(!hit.valid)continue;
    for(const gene of String(hit.gene||'').toUpperCase().split(/\s*\/\s*/))add(gene,hit.id,'Curated');
  }
  for(const hit of clinvar||[]){
    add(String(hit.e?.gene||'').toUpperCase(),String(hit.e?.id||'').toLowerCase(),'ClinVar');
  }
  return [...found.values()].sort((a,b)=>b.markers.size-a.markers.size||a.gene.localeCompare(b.gene))
    .slice(0,limit).map(row=>({gene:row.gene,markers:[...row.markers].sort(),sources:[...row.sources]}));
}
