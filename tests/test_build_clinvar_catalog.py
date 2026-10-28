import unittest
from scripts.build_clinvar_catalog import accepted

def record(**overrides):
    row={"RS# (dbSNP)":"6025","Assembly":"GRCh37","Chromosome":"1","PositionVCF":"123",
         "ReferenceAlleleVCF":"G","AlternateAlleleVCF":"A",
         "ClinicalSignificance":"Pathogenic",
         "ReviewStatus":"reviewed by expert panel","VariationID":"1234",
         "GeneSymbol":"F5","PhenotypeList":"Test condition"}
    row.update(overrides)
    return row

class ClinVarImportTests(unittest.TestCase):
    def test_strict_snv(self):
        item=accepted(record())
        self.assertEqual(item["id"],"rs6025")
        self.assertEqual(item["alt"],"A")
        self.assertEqual(item["build"],"GRCh37")
    def test_no_indel(self):
        self.assertIsNone(accepted(record(ReferenceAlleleVCF="AT")))
    def test_no_unknown_assembly(self):
        self.assertIsNone(accepted(record(Assembly="na")))
    def test_no_conflicting_review(self):
        self.assertIsNone(accepted(record(ReviewStatus="no assertion criteria provided")))
    def test_no_unmapped_rsid(self):
        self.assertIsNone(accepted(record(**{"RS# (dbSNP)":"-1"})))

if __name__=="__main__":
    unittest.main()
