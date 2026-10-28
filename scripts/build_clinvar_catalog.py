#!/usr/bin/env python3
"""Build a privacy-safe, allele-specific browser index from NCBI ClinVar.

Run on public reference data in GitHub Actions; NEVER on user DNA.
"""
import argparse
import csv
import datetime as dt
import gzip
import json
import re
import urllib.request
from pathlib import Path

URL = "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/variant_summary.txt.gz"
VALID = {"Pathogenic", "Likely pathogenic", "Pathogenic/Likely pathogenic",
         "Benign", "Likely benign", "Benign/Likely benign",
         "Uncertain significance", "Conflicting classifications of pathogenicity"}
BUILDS = {"GRCh37", "GRCh38"}
REVIEW = {"practice guideline", "reviewed by expert panel", "criteria provided, multiple submitters, no conflicts", "criteria provided, single submitter"}
RS_RE = re.compile(r"^(?:rs)?(\d+)$", re.I)

def accepted(row):
    raw = row.get("RS# (dbSNP)", "").strip()
    m = RS_RE.fullmatch(raw)
    if not m:
        return None
    build = row.get("Assembly", "")
    if build not in BUILDS:
        return None
    ref, alt = row.get("ReferenceAlleleVCF", "").upper(), row.get("AlternateAlleleVCF", "").upper()
    # Single nucleotide substitutions only, no indels, symbolic alleles or haplotypes.
    if len(ref) != 1 or len(alt) != 1 or ref not in "ACGT" or alt not in "ACGT" or ref == alt:
        return None
    chr_ = row.get("Chromosome", "").removeprefix("chr")
    position = row.get("PositionVCF", "")
    if chr_ not in {str(i) for i in range(1, 23)} | {"X", "Y", "MT"} or not position.isdigit():
        return None
    sig = row.get("ClinicalSignificance", "").strip()
    review = row.get("ReviewStatus", "").strip()
    if sig not in VALID or review not in REVIEW:
        return None
    variation = row.get("VariationID", "").strip()
    if not variation.isdigit():
        return None
    return {
        "id": "rs" + str(int(m.group(1))), "build": build, "chr": chr_,
        "pos": int(position), "ref": ref, "alt": alt,
        "sig": sig, "review": review,
        "condition": row.get("PhenotypeList", "").strip()[:300],
        "gene": row.get("GeneSymbol", "").strip()[:70],
        "variation": int(variation),
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", help="Local variant_summary.txt[.gz]; otherwise fetch NCBI")
    p.add_argument("--inventory", default="data/rsid_list.txt")
    p.add_argument("--output", default="dist/clinvar-evidence.json")
    p.add_argument("--limit", type=int, default=20000, help="Max distinct matching records, highest-confidence first")
    args = p.parse_args()
    ids = {s.strip().lower() for s in Path(args.inventory).read_text().splitlines() if s.strip()}
    # Prioritize variants with strongest review and clinical significance.
    best = {}
    def score(item):
        reviews = ["practice guideline", "reviewed by expert panel",
                   "criteria provided, multiple submitters, no conflicts",
                   "criteria provided, single submitter"]
        return (len(reviews) - reviews.index(item["review"]),
                int(item["sig"] in {"Pathogenic", "Likely pathogenic", "Pathogenic/Likely pathogenic"}))
    def consume(stream):
        reader = csv.DictReader((line.decode("utf-8-sig", errors="replace") for line in stream), delimiter="\t")
        for row in reader:
            item = accepted(row)
            if not item or item["id"] not in ids:
                continue
            key = (item["build"], item["chr"], item["pos"], item["ref"], item["alt"], item["variation"])
            prev = best.get(key)
            if prev is None or score(item) > score(prev):
                best[key] = item
    if args.source:
        with (gzip.open(args.source, "rb") if args.source.endswith(".gz") else open(args.source, "rb")) as stream:
            consume(stream)
    else:
        with urllib.request.urlopen(URL, timeout=180) as response:
            with gzip.GzipFile(fileobj=response) as stream:
                consume(stream)
    sorted_items = sorted(best.values(), key=lambda item: (-score(item)[0], -score(item)[1], item["id"], item["build"]))[:args.limit]
    payload = {"source": URL, "generated": dt.datetime.now(dt.timezone.utc).date().isoformat(),
               "count": len(sorted_items), "entries": sorted_items,
               "warning": "ClinVar classifications describe variant-condition assertions; not diagnoses or trait predictions."}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Created {output} with {len(sorted_items):,} records out of {len(best):,} eligible records")

if __name__ == "__main__":
    main()
