# SNP Reader

Privacy-first exploration of 23andMe and MyHeritage raw DNA files.

## Status

Early educational MVP. The website parses consumer genotype files entirely in the browser and includes a small curated interpretation catalog. It is **not a medical diagnostic tool**.

## Run locally

Serve `dist/` with any static HTTP server, e.g. `python3 -m http.server 8000 --directory dist`. Open `http://localhost:8000`.

## Offline evidence pipeline

1. Extract an rsID inventory and local genotype CSV using `myheritage_snp_extract.py`.
2. Download the official ClinVar `variant_summary.txt.gz` and run `clinvar_local_match.py --rsids rsid_list.txt --calls snp_data.csv --clinvar variant_summary.txt.gz`.
3. Review matches carefully: ClinVar classifications are allele- and condition-specific. Clinical claims require validation.

The raw DNA file, genotype CSV, and matching output are deliberately excluded from source control. The GSA rsID inventory used by the existing private Site is a separately generated reference asset, not personal genotype data.

## License

No open-source license selected yet. The repository is private while the evidence pipeline and privacy safeguards are being developed.
