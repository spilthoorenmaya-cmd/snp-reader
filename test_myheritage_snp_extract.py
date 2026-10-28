import tempfile
import unittest
import zipfile
from pathlib import Path
from myheritage_snp_extract import extract

SAMPLE = """##fileformat=MyHeritage
##format=MHv1.0
##chip=GSA
##reference=build37
# MyHeritage DNA raw data.
# The genotype is reported on the forward (+) strand.
RSID,CHROMOSOME,POSITION,RESULT
"rs547237130","1","72526","AA"
"rs562180473","1","565703","AA"
"rs1815739","11","66328095","CT"
"rs99888","1","99999","--"
"rs1815739","11","66328095","TT"
"not-an-rsid","1","1234","AA"
"""


class ExtractTests(unittest.TestCase):
    def test_csv_and_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            inp = Path(tmp) / "raw.csv"
            inp.write_text(SAMPLE)
            stats, snps = extract(inp, Path(tmp) / "out")
            self.assertEqual(len(snps), 4)
            self.assertEqual(stats["conflicting_duplicates"], 1)
            self.assertEqual(stats["no_calls"], 1)
            self.assertEqual(snps["rs1815739"][2], "CT")
            self.assertEqual((Path(tmp) / "out/rsid_list.txt").read_text().count("\n"), 4)

    def test_zip(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "raw.zip"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("MyHeritage_raw_dna_data.csv", SAMPLE)
            _, snps = extract(archive, Path(tmp) / "out")
            self.assertIn("rs547237130", snps)

    def test_tsv(self):
        with tempfile.TemporaryDirectory() as tmp:
            inp = Path(tmp) / "raw.txt"
            inp.write_text("##reference=build37\nRSID\tCHROMOSOME\tPOSITION\tRESULT\nrs1815739\t11\t66328095\tCT\n")
            _, snps = extract(inp, Path(tmp) / "out")
            self.assertEqual(snps["rs1815739"], ("11", "66328095", "CT"))


if __name__ == "__main__":
    unittest.main()
