#!/usr/bin/env python3
"""Extract rsIDs from consumer DNA files and compare to a known inventory.

Privacy: no network requests, no genotypes in outputs. Never commit raw DNA.
Supported: MyHeritage MHv1 CSV/TSV, 23andMe whitespace/TSV, optional ZIP.
"""
import argparse
import csv
import re
import sys
import zipfile
from pathlib import Path

RSID = re.compile(r"^rs[0-9]+$", re.IGNORECASE)
HEADERS = {"rsid", "chromosome", "position", "result", "genotype"}

def read_lines(path):
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            candidates = [n for n in archive.namelist()
                          if not n.endswith("/") and
                          Path(n).suffix.lower() in (".txt", ".csv", ".tsv")]
            if len(candidates) != 1:
                raise ValueError("ZIP must contain exactly one TXT/CSV/TSV DNA file")
            with archive.open(candidates[0]) as stream:
                import io
                for line in io.TextIOWrapper(stream, encoding="utf-8-sig", errors="replace"):
                    yield line
    else:
        with path.open(encoding="utf-8-sig", errors="replace") as stream:
            yield from stream

def extract(path):
    ids = set()
    invalid, duplicates, rows = 0, 0, 0
    for raw in read_lines(path):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # MyHeritage uses comma-delimited fields, 23andMe uses tabs.
        if "\t" in line:
            columns = next(csv.reader([line], delimiter="\t"))
        elif "," in line:
            columns = next(csv.reader([line]))
        else:
            columns = line.split()
        if not columns:
            continue
        candidate = columns[0].strip().strip('"').lower()
        if candidate in HEADERS:
            continue
        rows += 1
        if not RSID.fullmatch(candidate):
            invalid += 1
            continue
        if candidate in ids:
            duplicates += 1
        ids.add(candidate)
    return ids, {"rows": rows, "invalid": invalid, "duplicates": duplicates}

def load_inventory(path):
    if not path.exists():
        return set()
    ids = set()
    for lineno, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        item = raw.strip().lower()
        if not item or item.startswith("#"):
            continue
        if not RSID.fullmatch(item):
            raise ValueError(f"Invalid inventory entry at line {lineno}: {item[:80]}")
        ids.add(item)
    return ids

def ordered(ids):
    return sorted(ids, key=lambda s: int(s[2:]))

def write_ids(path, ids):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(s + "\n" for s in ordered(ids)), encoding="utf-8")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dna_file", type=Path, help="Local raw DNA TXT, CSV, TSV or ZIP")
    parser.add_argument("--inventory", type=Path, default=Path("data/rsid_list.txt"))
    parser.add_argument("--output", type=Path, default=Path("snp_output"))
    args = parser.parse_args()
    if not args.dna_file.is_file():
        parser.error(f"No such input: {args.dna_file}")
    sample, counts = extract(args.dna_file)
    known = load_inventory(args.inventory)
    missing = sample - known
    existing = sample & known
    args.output.mkdir(parents=True, exist_ok=True)
    write_ids(args.output / "sample_rsids.txt", sample)
    write_ids(args.output / "new_rsids.txt", missing)
    write_ids(args.output / "existing_rsids.txt", existing)
    # Candidate merge is only written locally. Review provenance before public commit.
    write_ids(args.output / "merged_inventory_candidate.txt", sample | known)
    print(f"Input markers: {len(sample):,}; known: {len(existing):,}; new: {len(missing):,}")
    print(f"Rows: {counts['rows']:,}; invalid: {counts['invalid']:,}; duplicates: {counts['duplicates']:,}")
    print(f"Outputs in {args.output} (rsIDs only; no genotypes)")
    print("Do NOT commit personal raw DNA. New rsIDs require research/evidence checks.")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, UnicodeError, zipfile.BadZipFile) as exc:
        sys.exit(str(exc))
