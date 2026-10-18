"""Prepare Pages prices without committing generated data. Previous Pages is the backup."""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from contract import MARKETS, encode_snapshot, market_key, market_url, parse_csv, validate_snapshot, validate_timestamp

def download(url):
    with urlopen(Request(url, headers={"User-Agent": "CraftCalc-TSM/1", "Cache-Control": "no-cache"}), timeout=45) as response:
        return response.read()

def restore(previous_url, fetch=download):
    if not previous_url:
        return None, {}
    base = previous_url.rstrip("/") + "/data/tsm/"
    return restore_from_base(base, fetch)

def restore_from_base(base, fetch=download):
    try:
        manifest = json.loads(fetch(base + "manifest.json"))
    except HTTPError as error:
        if error.code == 404:
            return None, {}
        raise
    if manifest.get("schemaVersion") != 1 or not isinstance(manifest.get("markets"), list):
        raise ValueError("Previous manifest is invalid; refusing to erase prices")
    validate_timestamp(manifest["generatedAt"])
    restored = {}
    for entry in manifest["markets"]:
        key = market_key(entry["market"])
        content_id = entry["contentId"]
        if not re.fullmatch(r"[a-f0-9]{64}", content_id) or entry["path"] != f"{key}.{content_id}.json" or key in restored:
            raise ValueError("Previous manifest entry is invalid")
        raw = fetch(base + entry["path"])
        if hashlib.sha256(raw).hexdigest() != content_id:
            raise ValueError("Previous snapshot checksum mismatch")
        snapshot = validate_snapshot(json.loads(raw), entry["market"])
        if snapshot["scannedAt"] != entry["scannedAt"]:
            raise ValueError("Previous snapshot timestamp mismatch")
        restored[key] = (entry, raw)
    return manifest, restored

def prepare(output, previous_url=None, fetch=download, keep_existing=False):
    # Restore all published snapshots before upstream requests: failure must abort deploy.
    output = Path(output)
    if keep_existing and (output / "manifest.json").is_file():
        previous_manifest, entries = restore_from_base(output.resolve().as_uri() + "/", fetch)
    else:
        previous_manifest, entries = restore(previous_url, fetch)
    failures = []
    for market in MARKETS:
        key = market_key(market)
        try:
            url = market_url(market)
            snapshot = parse_csv(fetch(url).decode("utf-8"), market)
            previous = entries.get(key)
            if previous and datetime.fromisoformat(snapshot["scannedAt"].replace("Z", "+00:00")) < datetime.fromisoformat(previous[0]["scannedAt"].replace("Z", "+00:00")):
                raise ValueError("Upstream snapshot is older than published data")
            raw, content_id = encode_snapshot(snapshot)
            entry = dict(market=market, scannedAt=snapshot["scannedAt"], contentId=content_id, path=f"{key}.{content_id}.json")
            entries[key] = (entry, raw)
        except Exception as error:
            failures.append(f"{key}: {error}")
    markets = [entries[key][0] for key in sorted(entries)]
    old_markets = sorted(previous_manifest["markets"], key=lambda entry: market_key(entry["market"])) if previous_manifest else None
    changed = markets != old_markets
    manifest = dict(schemaVersion=1, generatedAt=datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"), markets=markets)
    if not changed:
        manifest = previous_manifest
    output.mkdir(parents=True, exist_ok=True)
    for entry, raw in entries.values():
        (output / entry["path"]).write_bytes(raw)
    (output / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    return changed, failures, len(markets)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="dist/data/tsm")
    previous = parser.add_mutually_exclusive_group()
    previous.add_argument("--previous-url")
    previous.add_argument("--keep-existing", action="store_true")
    args = parser.parse_args()
    changed, failures, count = prepare(args.output, args.previous_url, keep_existing=args.keep_existing)
    for failure in failures:
        print(f"::warning::{failure}", file=sys.stderr)
    print(f"Prepared {count} markets; changed={changed}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as result:
            result.write(f"changed={str(changed).lower()}\n")

if __name__ == "__main__":
    main()
