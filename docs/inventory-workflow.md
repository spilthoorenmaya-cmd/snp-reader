# Reference marker inventory and ClinVar catalog

The published [SNP Reader](https://spilthoorenmaya-cmd.github.io/snp-reader/) contains **two separate datasets**:

1. `data/rsid_list.txt` — 609,424 unique rsIDs from a shareable MyHeritage GSA marker inventory, with **no individual genotypes**.
2. `dist/clinvar-evidence.json` — a generated, build- and allele-specific public ClinVar evidence snapshot, **not** a diagnosis or a complete catalog of clinically relevant variation.

Individual genotypes are parsed and matched inside the user's browser only.

## Compare an exported chip file locally

From the project root:

```bash
python3 scripts/compare_chip_inventory.py path/to/raw_dna.zip --inventory data/rsid_list.txt
```

The script handles supported MyHeritage CSV/TSV, 23andMe TXT/TSV and ZIP archives. It writes **only rsID lists** to the ignored `snp_output/` folder:

- `sample_rsids.txt`
- `existing_rsids.txt`
- `new_rsids.txt`
- `merged_inventory_candidate.txt`

Do not commit a private raw DNA export or its per-person genotype calls. A new rsID by itself is **not** a genotype interpretation, and any publicly committed inventory update must have independently shareable provenance (for example, an official chip manifest).

## Refresh ClinVar public evidence

The scheduled `.github/workflows/refresh-clinvar.yml` workflow downloads the official NCBI `variant_summary.txt.gz` and runs:

```bash
python3 scripts/build_clinvar_catalog.py --limit 20000
```

You can also use `--source path/to/variant_summary.txt.gz` for an offline build. The importer keeps selected single-nucleotide, build-specific, allele-specific records meeting its review/classification filters. It is **not** a complete clinical interpretation system. It intentionally excludes unsupported substitutions, indels, haplotypes, many classifications and other records that cannot be represented safely.

CI tests check the parser, importer and browser display logic. The static reference data and the genotype file are different inputs; the latter is **never sent to the reference-data pipeline**.

See the [root README](../README.md) for local setup and test commands.
