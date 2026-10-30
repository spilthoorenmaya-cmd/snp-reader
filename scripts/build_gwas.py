#!/usr/bin/env python3
"""Build a public, rsID-indexed GWAS snapshot from an official GWAS Catalog TSV.

Download the GWAS Catalog full associations TSV separately, then run:
 python3 scripts/build_gwas.py --input gwas_catalog.tsv --inventory data/rsid_list.txt --output dist/gwas-evidence.json

No uploaded DNA or genotypes are read. Association rows are research only.
"""
import argparse
import csv
import datetime
import json
import re
from pathlib import Path

RSID = re.compile(r"rs[1-9][0-9]*", re.I)


def build(source, inventory, max_per_marker=3):
    ids = {x.strip().lower() for x in Path(inventory).read_text(encoding="utf-8-sig").splitlines() if RSID.fullmatch(x.strip())}
    by_id = {}
    with Path(source).open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        needed = {"SNPS", "DISEASE/TRAIT", "FIRST AUTHOR", "PUBMEDID"}
        if not needed.issubset(reader.fieldnames or []):
            raise ValueError("GWAS Catalog TSV missing required columns")
        for row in reader:
            marker = (row.get("SNPS") or "").strip().lower()
            if marker not in ids or not RSID.fullmatch(marker):
                continue
            pubmed = (row.get("PUBMEDID") or "").strip()
            trait = (row.get("DISEASE/TRAIT") or "").strip()
            if not trait or not pubmed.isdigit():
                continue
            risk = (row.get("STRONGEST SNP-RISK ALLELE") or "").strip()
            effect = ""
            if risk.lower().startswith(marker + "-"):
                candidate = risk[len(marker) + 1:].upper()
                if re.fullmatch("[ACGT]", candidate):
                    effect = candidate
            # Only publish allele-specific associations. Ambiguous or missing
            # reported alleles cannot be verified against a DNA call locally.
            if not effect:
                continue
            record = {
                "rsid": marker, "trait": trait[:240],
                "author": (row.get("FIRST AUTHOR") or "").strip()[:100],
                "pubmed": pubmed, "effectAllele": effect,
                "pValue": (row.get("P-VALUE") or "").strip()[:60],
                "studyAccession": (row.get("STUDY ACCESSION") or "").strip()[:60],
            }
            found = by_id.setdefault(marker, [])
            if len(found) < max_per_marker and not any(x["pubmed"] == pubmed and x["trait"] == trait for x in found):
                found.append(record)
    entries = [row for marker in sorted(by_id) for row in by_id[marker]]
    return {
        "source": "NHGRI-EBI GWAS Catalog associations",
        "generated": datetime.date.today().isoformat(),
        "markerCount": len(by_id), "count": len(entries),
        "note": "Only single-base reported study alleles are included. Matching letters are not strand/build-validated or personal effect predictions.",
        "entries": entries,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True)
    p.add_argument("--inventory", default="data/rsid_list.txt")
    p.add_argument("--output", default="dist/gwas-evidence.json")
    p.add_argument("--max-per-marker", type=int, default=3)
    args = p.parse_args()
    if args.max_per_marker < 1:
        p.error("--max-per-marker must be positive")
    result = build(args.input, args.inventory, args.max_per_marker)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"GWAS research: {result['markerCount']} rsIDs, {result['count']} associations -> {target}")


if __name__ == "__main__":
    main()
