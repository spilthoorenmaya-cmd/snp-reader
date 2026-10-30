#!/usr/bin/env python3
"""Compare public rsID inventories without reading or storing genotypes.

Usage:
 python3 scripts/marker_overlap.py --inventory reference=data/rsid_list.txt \
   --inventory chipA=path/to/rsids.txt --inventory chipB=path/to/rsids.txt \
   --output-dir build/marker-overlap

Inputs must be rsID-only text files (one rsID per line). Do not supply personal
raw DNA exports: this tool intentionally rejects multi-column records.
"""
import argparse
import csv
import json
import re
from pathlib import Path

RSID = re.compile(r"rs[1-9][0-9]*", re.IGNORECASE)


def load_ids(path):
    ids = set()
    with Path(path).open(encoding="utf-8-sig") as handle:
        for number, line in enumerate(handle, 1):
            value = line.strip()
            if not value or value.startswith("#"):
                continue
            if not RSID.fullmatch(value):
                raise ValueError(f"{path}:{number}: expected a single rsID, not a raw DNA row")
            ids.add(value.lower())
    return ids


def calculate_overlap(inventories):
    names = list(inventories)
    union = set().union(*inventories.values()) if names else set()
    common = set.intersection(*(inventories[n] for n in names)) if names else set()
    pairs = []
    for i, left in enumerate(names):
        for right in names[i + 1:]:
            intersection = len(inventories[left] & inventories[right])
            pairs.append({
                "left": left, "right": right,
                "shared": intersection,
                "jaccard": round(intersection / len(inventories[left] | inventories[right]), 6)
                if inventories[left] | inventories[right] else 0,
                "left_coverage_percent": round(100 * intersection / len(inventories[left]), 2)
                if inventories[left] else 0,
                "right_coverage_percent": round(100 * intersection / len(inventories[right]), 2)
                if inventories[right] else 0,
            })
    return {
        "inventories": {name: len(ids) for name, ids in inventories.items()},
        "union": len(union), "shared_by_all": len(common),
        "unique_to_each": {
            name: len(ids - set().union(*(v for n, v in inventories.items() if n != name)))
            for name, ids in inventories.items()
        },
        "pairs": pairs,
    }, union, common


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", action="append", required=True, metavar="NAME=PATH")
    parser.add_argument("--output-dir", default="build/marker-overlap")
    args = parser.parse_args()
    inventories = {}
    for item in args.inventory:
        if "=" not in item:
            parser.error("Each --inventory must be NAME=PATH")
        name, path = item.split("=", 1)
        if not name or not path or name in inventories:
            parser.error("Inventory names must be nonempty and unique")
        inventories[name] = load_ids(path)
    report, union, common = calculate_overlap(inventories)
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    (output / "overlap.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (output / "union_rsids.txt").write_text("\n".join(sorted(union)) + "\n", encoding="utf-8")
    (output / "common_rsids.txt").write_text("\n".join(sorted(common)) + "\n", encoding="utf-8")
    with (output / "pairwise.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "left", "right", "shared", "jaccard",
            "left_coverage_percent", "right_coverage_percent"
        ])
        writer.writeheader()
        writer.writerows(report["pairs"])
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
