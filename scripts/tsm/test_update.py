import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError

from contract import MARKETS, encode_snapshot, market_key, parse_csv
from test_contract import ERA_ROW, HEADER, ROW
from update import download, prepare, restore

class UpdateTests(unittest.TestCase):
    def test_era_unknown_scan_time_is_published_restored_and_refreshed(self):
        def fetch(url):
            if url.startswith('file:'):
                return download(url)
            return (HEADER + (ROW if '-fresh/realm/' in url else ERA_ROW)).encode()
        with tempfile.TemporaryDirectory() as folder:
            changed, failures, count = prepare(folder, fetch=fetch, keep_existing=True)
            self.assertEqual((changed, failures, count), (True, [], len(MARKETS)))
            manifest = json.loads((Path(folder) / 'manifest.json').read_text())
            for entry in manifest['markets']:
                if entry['market'].get('version') == 'classic':
                    self.assertIsNone(entry['scannedAt'])
                    self.assertIsNone(json.loads((Path(folder) / entry['path']).read_bytes())['scannedAt'])
                else:
                    self.assertIsNotNone(entry['scannedAt'])
            self.assertEqual(prepare(folder, fetch=fetch, keep_existing=True), (False, [], len(MARKETS)))
            def updated(url):
                return fetch(url).replace(b'946620', b'946621') if not url.startswith('file:') else fetch(url)
            self.assertEqual(prepare(folder, fetch=updated, keep_existing=True), (True, [], len(MARKETS)))

    def test_local_refresh_bootstraps_and_retains_snapshots_when_offline(self):
        with tempfile.TemporaryDirectory() as folder:
            _, failures, count = prepare(folder, fetch=lambda _: (HEADER + ROW).encode(), keep_existing=True)
            self.assertEqual((failures, count), ([], len(MARKETS)))
            original = (Path(folder) / "manifest.json").read_bytes()
            def offline(url):
                if url.startswith("file:"):
                    return download(url)
                raise OSError("TSM unavailable")
            changed, failures, count = prepare(folder, fetch=offline, keep_existing=True)
            self.assertEqual((changed, len(failures), count), (False, len(MARKETS), len(MARKETS)))
            self.assertEqual((Path(folder) / "manifest.json").read_bytes(), original)

    def previous(self):
        snapshot = parse_csv(HEADER + ROW, MARKETS[0])
        raw, content_id = encode_snapshot(snapshot)
        entry = dict(market=MARKETS[0], scannedAt=snapshot["scannedAt"], contentId=content_id, path=f"{market_key(MARKETS[0])}.{content_id}.json")
        manifest = dict(schemaVersion=1, generatedAt="2026-01-01T00:00:00Z", markets=[entry])
        return raw, entry, manifest

    def test_first_run(self):
        with tempfile.TemporaryDirectory() as folder:
            changed, failures, count = prepare(folder, fetch=lambda _: (HEADER + ROW).encode())
            self.assertTrue(changed)
            self.assertEqual((failures, count), ([], len(MARKETS)))
            manifest = json.loads((Path(folder) / "manifest.json").read_text())
            self.assertEqual(len(list(Path(folder).glob("*.json"))), len(MARKETS) + 1)
            self.assertEqual(len(manifest["markets"]), len(MARKETS))

    def test_failed_markets_keep_previous_and_unchanged_skips_deploy(self):
        raw, entry, manifest = self.previous()
        def fetch(url):
            if url.endswith("manifest.json"):
                return json.dumps(manifest).encode()
            if url.endswith(entry["path"]):
                return raw
            raise OSError("TSM unavailable")
        with tempfile.TemporaryDirectory() as folder:
            changed, failures, count = prepare(folder, "https://example.test/project", fetch)
            self.assertFalse(changed)
            self.assertEqual((len(failures), count), (len(MARKETS), 1))
            self.assertEqual((Path(folder) / entry["path"]).read_bytes(), raw)
            self.assertEqual(json.loads((Path(folder) / "manifest.json").read_text()), manifest)

    def test_restore_failure_aborts_instead_of_erasing_successful_prices(self):
        raw, entry, manifest = self.previous()
        for broken in [b"broken", b"{}"]:
            def fetch(url):
                return json.dumps(manifest).encode() if url.endswith("manifest.json") else broken
            with self.assertRaises(ValueError):
                restore("https://example.test", fetch)
        manifest["markets"][0]["path"] = "../secret"
        with self.assertRaises(ValueError):
            restore("https://example.test", lambda _: json.dumps(manifest).encode())

    def test_absent_previous_manifest_bootstraps_but_network_error_aborts(self):
        def missing(_):
            raise HTTPError("https://example.test", 404, "missing", {}, None)
        self.assertEqual(restore("https://example.test", missing), (None, {}))
        def failed(_):
            raise OSError("offline")
        with self.assertRaises(OSError):
            restore("https://example.test", failed)

    def test_older_upstream_does_not_replace_published_snapshot(self):
        raw, entry, manifest = self.previous()
        def fetch(url):
            if url.endswith("manifest.json"):
                return json.dumps(manifest).encode()
            if url.endswith(entry["path"]):
                return raw
            return (HEADER + ROW.replace("2026-01-01", "2025-01-01")).encode()
        with tempfile.TemporaryDirectory() as folder:
            _, failures, _ = prepare(folder, "https://example.test", fetch)
            self.assertEqual(len(failures), 1)
            self.assertEqual((Path(folder) / entry["path"]).read_bytes(), raw)

if __name__ == "__main__":
    unittest.main()
