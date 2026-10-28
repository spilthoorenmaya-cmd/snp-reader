# SNP Reader

**Explore your raw DNA data in your browser — with sources, context, and no account.**

[Open SNP Reader](https://spilthoorenmaya-cmd.github.io/snp-reader/) · [Test status](https://github.com/spilthoorenmaya-cmd/snp-reader/actions/workflows/test.yml) · [Deployment status](https://github.com/spilthoorenmaya-cmd/snp-reader/actions/workflows/deploy-pages.yml)

SNP Reader is a static, educational reader for 23andMe and MyHeritage raw DNA exports. It checks the genotype, genomic coordinates, reference build, and alleles before presenting supported interpretations. A matching rsID alone is **not** a clinical finding.

## What the site does

- **Clinical evidence:** Explore ClinVar classifications for specific variants and conditions, with links to original records. ClinVar classifications are *not* personal diagnoses.
- **Carrier-related information:** Review selected one-copy recessive-pattern findings and context about family planning. These are **not** confirmed clinical carrier-screening results.
- **Traits and research:** Read selected, sourced genotype-specific associations (e.g., pigmentation or nutrition), clearly separated from clinical assertions.
- **Benign and unreviewed variants:** Keep non-disease-associated findings and raw markers separate from potentially relevant clinical evidence.
- **Family traits explorer:** Explore how an eye-color marker might be inherited, without turning one SNP into a predicted baby eye color or invented percentages.

The reference inventory lists **609,424 chip rsIDs**, not 609,424 clinical interpretations. The separate generated ClinVar catalog is a snapshot and only covers qualifying records.

## Privacy

Your uploaded DNA file is parsed **locally in your browser**. SNP Reader does not send your genotype file to its servers or to NIH/NCBI. The page downloads publicly available reference assets independently of your DNA data. Optional age, sex and ancestry context, along with the family-traits explorer selections, remain in the browser tab and are not stored or included in exported data.

Like other public websites, GitHub Pages and externally hosted font/reference providers may receive ordinary page or asset requests. **No account, backend DNA upload, analytics service, or personal DNA database is required.**

## Run locally

Requires a modern browser and Python 3 for the static development server:

```bash
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`, then select a TXT, CSV, TSV or supported ZIP export. You can also use the **fictional sample genome** without supplying personal data.

### Tests

Node.js 22 and Python 3.12 are used by GitHub Actions. Chromium tests use Playwright.

```bash
npm install
npm test                  # DNA parsing, allele matching, ClinVar and feature unit tests
npm run test:coverage     # Coverage report with minimum thresholds
npm run test:e2e          # Real Chromium upload, filtering and interaction tests
python3 -m unittest discover -s tests -p "test_*.py"
```

The workflows in `.github/workflows/` also run the offline Python tests in the repository root. Coverage thresholds apply to the **JavaScript helper modules**, not all application code or browser interactions.

## Repository layout

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/styles.css`, `dist/table.css`, `dist/inventory.css` | Static UI and styles |
| `dist/app.js` | Browser-only upload flow and result presentation |
| `dist/dna-parser.js`, `dist/snp-matching.js`, `dist/zip-reader.js` | Genotype import and exact-match validation |
| `dist/clinvar-display.js`, `dist/serpina1.js`, `dist/baby-eye-explorer.js` | Evidence explanation and limited educational features |
| `dist/extra-catalog.js` | Small manually reviewed research catalog |
| `dist/clinvar-evidence.json` | Generated public allele-specific ClinVar snapshot |
| `data/rsid_list.txt` | Public reference chip-marker inventory; **no genotypes** |
| `scripts/` | Reference-data build scripts |
| `tests/`, `test_*.py` | Automated regression tests |

## Evidence and limitations

- [NCBI dbSNP](https://www.ncbi.nlm.nih.gov/snp/) identifies variants; an rsID is not a disease.
- [ClinVar](https://www.ncbi.nlm.nih.gov/clinvar/) reports evidence **for specific alleles and conditions** and can contain uncertain or conflicting classifications.
- [MedlinePlus Genetics](https://medlineplus.gov/genetics/) explains inheritance, gene function, and why traits such as eye color involve many genes.
- [NHGRI–EBI GWAS Catalog](https://www.ebi.ac.uk/gwas/) provides research associations that require their own evidence and population context.

A consumer genotype array is **not whole-gene or whole-genome clinical sequencing**. A missing call does not rule out a condition; a homozygous *benign* variant is not a diagnosis; a one-copy recessive-pattern match is not necessarily confirmed carrier status. Clinical interpretation requires confirmatory testing, personal/family history, and professional assessment.

For details on offline data extraction and the ClinVar build, see [docs/inventory-workflow.md](docs/inventory-workflow.md) and [data/README.md](data/README.md).

## License

This repository is publicly viewable. **No reuse license has been granted yet**; code and assets remain subject to copyright until a license is selected.
