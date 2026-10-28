# SNP inventory

Place the shared MyHeritage GSA rsID inventory at `data/rsid_list.txt`.

Expected format: one `rs12345` identifier per line, UTF-8 text, no genotypes.

Inventory snapshot: 609,424 unique rsIDs from a MyHeritage MHv1.0 / GSA (GRCh37) export. This is a marker list, **not** clinical interpretations or genotype calls. Never commit raw DNA files or genotype columns.

The catalog can be used to filter public ClinVar reference data. Actual genotypes must be matched in the user's browser, locally.
