import tempfile
import unittest
import zipfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from compare_chip_inventory import extract, load_inventory, write_ids

class InventoryTests(unittest.TestCase):
    def test_myheritage(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "mh.csv"
            p.write_text("##fileformat=MyHeritage\nRSID,CHROMOSOME,POSITION,RESULT\nrs547237130,1,72526,AA\nrs562180473,1,565703,AA\n")
            self.assertEqual(extract(p)[0], {"rs547237130", "rs562180473"})

    def test_23andme(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "23.txt"
            p.write_text("# rsid chromosome position genotype\nrs1800562\t6\t26093141\tGG\nrs1800562\t6\t26093141\tGG\n")
            ids, stats = extract(p)
            self.assertEqual(ids, {"rs1800562"})
            self.assertEqual(stats["duplicates"], 1)

    def test_zip(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "raw.zip"
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("raw.txt", "# test\nrs671\t12\t111803962\tAG\n")
            self.assertEqual(extract(p)[0], {"rs671"})

    def test_inventory(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "rsids.txt"
            write_ids(p, {"rs9", "rs2", "rs10"})
            self.assertEqual(p.read_text(), "rs2\nrs9\nrs10\n")
            self.assertEqual(load_inventory(p), {"rs2", "rs9", "rs10"})

if __name__ == "__main__":
    unittest.main()
