import csv
import gzip
import tempfile
import unittest
from pathlib import Path
from clinvar_local_match import classify_call, read_calls, read_rsids, scan_clinvar


class ClinVarMatcherTests(unittest.TestCase):
    def test_allele_and_coordinate_checks(self):
        self.assertEqual(classify_call(("6", "26093141", "AG"), "6", "26093141", "G", "A"), ("AG", "1", "alternate_present"))
        self.assertEqual(classify_call(("6", "26093141", "GG"), "6", "26093141", "G", "A")[2], "alternate_absent")
        self.assertEqual(classify_call(("6", "26093142", "AG"), "6", "26093141", "G", "A")[2], "coordinate_mismatch")
        self.assertEqual(classify_call(("6", "26093141", "CT"), "6", "26093141", "G", "A")[2], "allele_mismatch")

    def test_streamed_clinvar_join(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "rsids.txt").write_text("rs1800562\nrs999\n")
            (root / "calls.csv").write_text("rsid,chromosome,position,genotype\nrs1800562,6,26093141,AG\n")
            headers = ["RS# (dbSNP)", "Assembly", "Chromosome", "Start", "ReferenceAllele", "AlternateAllele", "ClinicalSignificance", "ReviewStatus", "VariationID", "GeneSymbol", "PhenotypeList", "LastEvaluated"]
            with gzip.open(root / "variant_summary.txt.gz", "wt", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=headers, delimiter="\t")
                writer.writeheader()
                writer.writerow({"RS# (dbSNP)":"1800562","Assembly":"GRCh37","Chromosome":"6","Start":"26093141","ReferenceAllele":"G","AlternateAllele":"A","ClinicalSignificance":"Pathogenic","ReviewStatus":"criteria provided, multiple submitters, no conflicts","VariationID":"123","GeneSymbol":"HFE","PhenotypeList":"Hemochromatosis","LastEvaluated":"2025-01-01"})
                writer.writerow({"RS# (dbSNP)":"1800562","Assembly":"GRCh38","Chromosome":"6","Start":"26093141","ReferenceAllele":"G","AlternateAllele":"A"})
            stats = scan_clinvar(read_rsids(root / "rsids.txt"), read_calls(root / "calls.csv"), root / "variant_summary.txt.gz", root / "out")
            self.assertEqual(stats["overlapping_records"], 1)
            with (root / "out/clinvar_matches.csv").open() as f:
                row = next(csv.DictReader(f))
            self.assertEqual(row["alternate_copies"], "1")
            self.assertEqual(row["match_status"], "alternate_present")


if __name__ == "__main__":
    unittest.main()
