# SNP Reader — ideas and next steps

This is a working to-do list, not a promise that a feature is ready or medically validated.

## Next: maintain the core reader

- [ ] Keep uploads, ZIP parsing, genome-build verification, allele matching and results navigation covered by automated regression tests.
- [ ] Expand curated variant interpretations only when they have clear allele-specific evidence, appropriate citations and honest limitations.
- [ ] Improve evidence labeling so benign, carrier-related, uncertain, and potentially relevant variants remain easy to distinguish.
- [ ] Continue improving accessibility, mobile layout, performance and readability without introducing unnecessary interface sections.

## Later: go beyond medical genetics

- [ ] Explore **non-medical traits and everyday research**: pigmentation, sleep timing, taste perception, nutrition and exercise-related associations, where credible genotype-specific evidence exists.
- [ ] Investigate trustworthy sources beyond ClinVar, such as the [NHGRI–EBI GWAS Catalog](https://www.ebi.ac.uk/gwas/), relevant peer-reviewed studies, and accessible NIH explanations. Distinguish population-level associations from individual predictions.
- [ ] Design a dedicated **non-medical discovery experience** only if there is enough well-supported content to justify it. Avoid a miscellaneous “just for fun” tab in the current medical/carrier report.
- [ ] Consider explanatory graphics for polygenic traits **without invented individual probabilities**, simplistic dominant/recessive calculators, or claims that a consumer SNP file measures all relevant variants.

## Quality requirements for any future feature

- Explain what is measured versus what is inferred, and provide sources and confidence/limitations.
- Never turn one rsID or an unverified position into a health diagnosis, carrier certainty, offspring prediction or guaranteed advantage.
- Keep raw DNA and optional user selections on-device; do not upload genotype calls to external services.
- Add unit and real-browser tests for correct and missing data, wrong genome builds, allele matching, and accessibility.
- Ship new sections when they solve a clear user need, rather than adding visual clutter.

## Removed from the current product

The previous **Exploring / eye-color baby** experiment was removed from the application at the user's request. Its presence should not be assumed in future UI plans; possible non-medical features belong in the longer-term backlog above.
