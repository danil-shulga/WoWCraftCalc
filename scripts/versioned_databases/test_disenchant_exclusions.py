import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from scripts.build_disenchant_exclusions import build


class DisenchantExclusionsTest(unittest.TestCase):
    def test_preserves_flags_and_filters_quality_class_and_bit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifests = root / "data-preparation/manifests"
            manifests.mkdir(parents=True)
            contents = {
                "Item": "ID,ClassID\n1,2\n2,4\n3,4\n4,7\n5,4\n",
                "ItemSparse": (
                    "ID,OverallQualityID,Flags_0\n"
                    "1,2,32768\n2,4,36864\n3,3,0\n4,2,32768\n5,1,32768\n6,3,32768\n"
                ),
            }
            sources = []
            for table, text in contents.items():
                path = root / f"{table}.csv"
                path.write_bytes(text.encode())
                sources.append({
                    "table": table, "locale": "enUS", "path": path.name,
                    "fileName": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "url": f"https://example.com/{table}",
                })
            manifest_path = manifests / "classic.test.json"
            manifest = {"gameVersion": "classic", "build": "test", "sources": sources}
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            result = build("classic", root)
            self.assertEqual(result["entries"], [
                {"itemId": 1, "flags": 32768}, {"itemId": 2, "flags": 36864},
            ])
            self.assertEqual(result["sources"], [
                {key: source[key] for key in ("fileName", "sha256", "url")}
                for source in sources
            ])
            (root / "ItemSparse.csv").write_text("changed", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Hash mismatch"):
                build("classic", root)

    def test_rejects_ambiguous_or_missing_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, "Expected one"):
                build("classic", root)
            manifests = root / "data-preparation/manifests"
            manifests.mkdir(parents=True)
            for name in ("classic.a.json", "classic.b.json"):
                (manifests / name).write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Expected one"):
                build("classic", root)


if __name__ == "__main__":
    unittest.main()
