# Multi-chip rsID inventory

Run locally from the project root:

    python scripts/compare_chip_inventory.py path/to/raw_dna.zip --inventory data/rsid_list.txt

Supports MyHeritage CSV/TSV and 23andMe TXT/TSV and ZIP archives.
Writes only rsIDs (never genotypes) to the local snp_output directory:
sample_rsids.txt, existing_rsids.txt, new_rsids.txt, merged_inventory_candidate.txt.

New identifiers are NOT evidence-backed by default.
Before committing an updated inventory, confirm shareable provenance from official
chip manifests rather than using a person's private genome export as provenance.

ClinVar data must be maintained separately, including genomic build, ref/alt
alleles, condition, classification, review status and source. Genotype matching
belongs inside the user's browser.

TODO: upload the rsID-only inventory to data/rsid_list.txt and implement the
ClinVar refresh + browser matching engine.
