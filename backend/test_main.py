import unittest

from main import normalize_metadata


class NormalizeMetadataTests(unittest.TestCase):
    def test_receipt_categories_are_normalized(self):
        self.assertEqual(normalize_metadata({"category": "Receipts"})["category"], "Receipt")
        self.assertEqual(normalize_metadata({"category": "receipt"})["category"], "Receipt")

    def test_unknown_categories_default_to_miscellaneous(self):
        self.assertEqual(normalize_metadata({"category": "Unexpected"})["category"], "Miscellaneous")


if __name__ == "__main__":
    unittest.main()
