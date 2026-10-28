#!/usr/bin/env python3
"""Match MyHeritage rsIDs and optional genotypes against an official ClinVar TSV.

The SNP inventory and genotypes stay local. No genotype data is uploaded.
Requires Python 3.9+, standard library only.

Examples:
  python clinvar_local_match.py --rsids rsid_list.txt --clinvar variant_summary.txt.gz
  python clinvar_local_match.py --rsids rsid_list.txt --calls snp_data.csv --clinvar variant_summary.txt.gz
  python clinvar_local_match.py --rsids rsid_list.txt --calls snp_data.csv --download-clinvar

ClinVar download source:
https://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/variant_summary.txt.gz
"""

import argparse
import csv
import gzip
import io
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

CLINVAR_URL = "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/variant_summary.txt.gz"
OUTPUT_COLUMNS = ["rsid", "gene", "chromosome", "position_grch37", "reference_allele",
                  "alternate_allele", "your_genotype", "alternate_copies", "match_status",
                  "clinical_significance", "condition", "review_status", "variation_id",
                  "last_evaluated", "clinvar_url"]
RS = re.compile(r"^(?:rs)?(\d+)$", re.I)


def read_rsids(path):
    with path.open(encoding="utf-8-sig") as stream:
        rsids = {line.strip().lower() for line in stream if re.fullmatch(r"rs\d+", line.strip(), re.I)}
    if not rsids:
        raise ValueError("No valid rsIDs in the list.")
    return rsids


def read_calls(path):
    if path is None:
        return {}
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        cols = {name.lower().strip(): name for name in (reader.fieldnames or [])}
        if not {"rsid", "chromosome", "position", "genotype"} <= cols.keys():
            raise ValueError("Calls CSV must have rsid,chromosome,position,genotype columns.")
        calls = {}
        for row in reader:
            rsid = row[cols["rsid"]].strip().lower()
            if re.fullmatch(r"rs\d+", rsid):
                calls[rsid] = (row[cols["chromosome"]].strip().upper().removeprefix("CHR"),
                               row[cols["position"]].strip(), row[cols["genotype"]].strip().upper())
    return calls


def download_clinvar(path):
    if path.exists():
        print(f"Using cached ClinVar file: {path}")
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".partial")
    print("Downloading public ClinVar data (large file; may take several minutes)…")
    try:
        with urllib.request.urlopen(CLINVAR_URL, timeout=90) as response, temp.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        temp.replace(path)
    except Exception:
        temp.unlink(missing_ok=True)
        raise
    return path


def classify_call(call, chr_, position, ref, alt):
    """Only count a match when assembly coordinates AND forward-strand alt agree."""
    if call is None:
        return "", "", "not_checked_no_genotypes"
    called_chr, called_pos, gt = call
    if called_chr != chr_.upper().removeprefix("CHR") or called_pos != position:
        return gt, "", "coordinate_mismatch"
    if gt in ("--", "00") or not gt:
        return gt, "", "no_call"
    if len(gt) != 2 or any(base not in "ACGT" for base in gt):
        return gt, "", "unsupported_genotype"
    if len(ref) != 1 or len(alt) != 1 or ref not in "ACGT" or alt not in "ACGT":
        return gt, "", "complex_allele_not_interpreted"
    if any(base not in (ref, alt) for base in gt):
        return gt, "", "allele_mismatch"
    copies = gt.count(alt)
    return gt, str(copies), "alternate_present" if copies else "alternate_absent"


def scan_clinvar(rsids, calls, clinvar_path, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    stats = Counter()
    observed = set()
    target = output_dir / "clinvar_matches.csv"
    opener = gzip.open if str(clinvar_path).endswith(".gz") else open
    with opener(clinvar_path, "rt", encoding="utf-8", newline="") as source, target.open("w", encoding="utf-8", newline="") as dest:
        reader = csv.DictReader(source, delimiter="\t")
        writer = csv.DictWriter(dest, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        fieldnames = set(reader.fieldnames or [])
        required = {"RS# (dbSNP)", "Assembly", "Chromosome", "Start", "ReferenceAllele",
                    "AlternateAllele", "ClinicalSignificance", "ReviewStatus", "VariationID"}
        if not required <= fieldnames:
            raise ValueError("Unsupported ClinVar columns. Missing: " + ", ".join(sorted(required-fieldnames)))
        for row in reader:
            stats["scanned_clinvar_rows"] += 1
            if row.get("Assembly") != "GRCh37":
                continue
            raw_rsid = (row.get("RS# (dbSNP)") or "").strip()
            m = RS.fullmatch(raw_rsid)
            if not m:
                continue
            rsid = "rs" + m.group(1)
            if rsid not in rsids:
                continue
            stats["overlapping_records"] += 1
            observed.add(rsid)
            ref = (row.get("ReferenceAllele") or "").upper()
            alt = (row.get("AlternateAllele") or "").upper()
            chr_ = row.get("Chromosome") or ""
            pos = row.get("Start") or ""
            gt, copies, status = classify_call(calls.get(rsid), chr_, pos, ref, alt)
            stats[status] += 1
            vid = (row.get("VariationID") or "").strip()
            writer.writerow({
                "rsid": rsid, "gene": row.get("GeneSymbol", ""), "chromosome": chr_,
                "position_grch37": pos, "reference_allele": ref, "alternate_allele": alt,
                "your_genotype": gt, "alternate_copies": copies, "match_status": status,
                "clinical_significance": row.get("ClinicalSignificance", ""),
                "condition": row.get("PhenotypeList", ""),
                "review_status": row.get("ReviewStatus", ""),
                "variation_id": vid, "last_evaluated": row.get("LastEvaluated", ""),
                "clinvar_url": f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{vid}/" if vid.isdigit() else ""
            })
            if stats["scanned_clinvar_rows"] % 1_000_000 == 0:
                print(f"Processed {stats['scanned_clinvar_rows']:,} ClinVar rows…", file=sys.stderr)
    print(f"ClinVar rows scanned: {stats['scanned_clinvar_rows']:,}")
    print(f"Your rsIDs with >=1 ClinVar record: {len(observed):,}")
    print(f"Matching ClinVar records: {stats['overlapping_records']:,}")
    if calls:
        print(f"Alternate allele present: {stats['alternate_present']:,} records")
        print(f"Alternate allele absent: {stats['alternate_absent']:,} records")
        print(f"Unresolved (coordinate/allele/no-call/other): {sum(v for k,v in stats.items() if k in ('coordinate_mismatch','allele_mismatch','no_call','unsupported_genotype','complex_allele_not_interpreted')):,}")
    print(f"Saved: {target}")
    print("Do not treat ClinVar classifications as a diagnosis. Confirm clinically significant calls with a qualified professional.")
    return stats


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rsids", required=True, type=Path, help="rsid_list.txt from the offline extractor")
    parser.add_argument("--calls", type=Path, help="Optional private snp_data.csv to check actual alleles")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--clinvar", type=Path, help="Downloaded ClinVar variant_summary.txt.gz")
    group.add_argument("--download-clinvar", action="store_true", help="Download public ClinVar dataset once, with no personal data sent")
    parser.add_argument("-o", "--output", type=Path, default=Path("clinvar_output"))
    args = parser.parse_args()
    try:
        rsids = read_rsids(args.rsids)
        calls = read_calls(args.calls)
        source = download_clinvar(Path("clinvar_reference/variant_summary.txt.gz")) if args.download_clinvar else args.clinvar
        scan_clinvar(rsids, calls, source, args.output)
        return 0
    except (OSError, ValueError, EOFError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
