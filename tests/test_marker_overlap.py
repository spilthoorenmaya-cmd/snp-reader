import tempfile
import unittest
from pathlib import Path
from scripts.marker_overlap import calculate_overlap, load_ids

class OverlapTests(unittest.TestCase):
    def test_counts(self):
        result, union, shared = calculate_overlap({'a': {'rs1', 'rs2'}, 'b': {'rs2', 'rs3'}})
        self.assertEqual(result['union'], 3)
        self.assertEqual(result['shared_by_all'], 1)
        self.assertEqual(shared, {'rs2'})
        self.assertEqual(len(union), 3)

    def test_input_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'ids.txt'
            path.write_text('RS1\nrs2\n')
            self.assertEqual(load_ids(path), {'rs1', 'rs2'})
            path.write_text('rs1,1,123,AG\n')
            with self.assertRaises(ValueError):
                load_ids(path)

if __name__ == '__main__':
    unittest.main()
