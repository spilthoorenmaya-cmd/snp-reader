#!/usr/bin/env python3
"""Extract MyHeritage rsIDs and genotype calls, entirely offline.

Usage: python myheritage_snp_extract.py MyHeritage_raw_dna_data.csv
       python myheritage_snp_extract.py MyHeritage_raw_dna_data.zip -o output_folder
"""

import argparse
import csv
import io
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

RSID = re.compile(r"^rs[0-9]+$", re.IGNORECASE)
GENOTYPE = re.compile(r"^(?:[ACGT]{1,2}|--|00|II|DD|ID|DI)$", re.IGNORECASE)
FIELDS = ("RSID", "CHROMOSOME", "POSITION", "RESULT")


def read_source(path):
    """Return a text stream, including when the supplier provided a ZIP."""
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            names = [n for n in archive.namelist()
                     if not n.startswith("__MACOSX/")
                     and not n.endswith("/")
                     and n.lower().endswith((".csv", ".txt", ".tsv"))]
            if not names:
                raise ValueError("No CSV/TXT/TSV raw DNA file found in ZIP.")
            if len(names) > 1:
                raise ValueError("ZIP contains multiple DNA-like files. Extract and choose one explicitly.")
            if archive.getinfo(names[0]).file_size > 150_000_000:
                raise ValueError("Uncompressed file exceeds the 150 MB safety limit.")
            return io.StringIO(archive.read(names[0]).decode("utf-8-sig"))
    if path.stat().st_size > 150_000_000:
        raise ValueError("Input file exceeds the 150 MB safety limit.")
    return path.open("r", encoding="utf-8-sig", newline="")


def extract(input_path, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    stats = Counter()
    snps = {}
    metadata = {}
    with read_source(input_path) as source:
        # MyHeritage MHv1.0 has comment lines beginning with # or ##.
        lines = iter(source)
        header_line = None
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("##") and "=" in stripped:
                k, v = stripped[2:].split("=", 1)
                metadata[k.strip().lower()] = v.strip()
            if stripped.lstrip("# ").upper().startswith("RSID"):
                header_line = stripped.lstrip("# ")
                break
        if header_line is None:
            raise ValueError("No RSID header found. Supply the original MyHeritage export, not a Markdown table.")
        delimiter = "\t" if "\t" in header_line else "," if "," in header_line else None
        if delimiter is None:
            raise ValueError("Expected comma- or tab-separated columns.")
        header = next(csv.reader([header_line], delimiter=delimiter))
        normalized = [h.strip().upper() for h in header]
        if not set(FIELDS).issubset(normalized):
            raise ValueError(f"Expected columns {FIELDS}; found {normalized}.")
        indices = [normalized.index(field) for field in FIELDS]
        reader = csv.reader(lines, delimiter=delimiter)
        for row in reader:
            if not row or all(not c.strip() for c in row):
                continue
            if row[0].lstrip().startswith("#"):
                continue
            stats["data_rows"] += 1
            if len(row) <= max(indices):
                stats["malformed_rows"] += 1
                continue
            rsid, chromosome, position, genotype = [row[i].strip() for i in indices]
            rsid = rsid.lower()
            genotype = genotype.upper()
            if not RSID.fullmatch(rsid) or not GENOTYPE.fullmatch(genotype):
                stats["invalid_rows"] += 1
                continue
            if not position.isdigit() or not chromosome:
                stats["invalid_rows"] += 1
                continue
            if rsid in snps:
                stats["duplicate_rsids"] += 1
                if snps[rsid] != (chromosome, position, genotype):
                    stats["conflicting_duplicates"] += 1
                continue  # Keep the first occurrence; do not silently overwrite.
            snps[rsid] = (chromosome, position, genotype)
            if genotype in ("--", "00"):
                stats["no_calls"] += 1
    if not snps:
        raise ValueError("No valid rsID rows found.")

    # Use fixed output filenames and never include names, timestamps or raw input path.
    ids_path = output_dir / "rsid_list.txt"
    calls_path = output_dir / "snp_data.csv"
    with ids_path.open("w", encoding="utf-8", newline="\n") as f:
        for rsid in snps:
            f.write(rsid + "\n")
    with calls_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(("rsid", "chromosome", "position", "genotype"))
        for rsid, values in snps.items():
            writer.writerow((rsid, *values))
    print(f"Unique rsIDs: {len(snps):,}")
    print(f"No-calls: {stats['no_calls']:,}")
    print(f"Duplicates: {stats['duplicate_rsids']:,} (conflicting: {stats['conflicting_duplicates']:,})")
    print(f"Malformed/invalid rows: {stats['malformed_rows'] + stats['invalid_rows']:,}")
    print(f"Reference: {metadata.get('reference', 'not declared')}; chip: {metadata.get('chip', 'not declared')}")
    print(f"Created: {ids_path} and {calls_path}")
    print("Privacy: no network requests made. Keep snp_data.csv private.")
    return stats, snps


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path, help="Original MyHeritage CSV/TXT/TSV or ZIP export")
    parser.add_argument("-o", "--output", type=Path, default=Path("snp_output"), help="Output folder (default: snp_output)")
    args = parser.parse_args()
    try:
        extract(args.file, args.output)
    except (OSError, ValueError, zipfile.BadZipFile, UnicodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
