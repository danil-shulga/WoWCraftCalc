"""Rebuild bundled Classic/TBC no-disenchant snapshots from pinned local CSVs."""

import csv
import hashlib
import json
from pathlib import Path


def build(version: str, root: Path) -> dict:
    manifests = list((root / "data-preparation/manifests").glob(f"{version}.*.json"))
    if len(manifests) != 1:
        raise ValueError(f"Expected one pinned manifest for {version}")
    manifest = json.loads(manifests[0].read_text(encoding="utf-8"))
    if manifest["gameVersion"] != version:
        raise ValueError("Manifest version mismatch")
    tables = {}
    sources = []
    for table in ("Item", "ItemSparse"):
        source = next(
            entry for entry in manifest["sources"]
            if entry["table"] == table and entry["locale"] == "enUS"
        )
        path = root / source["path"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"Hash mismatch: {path}")
        with path.open(encoding="utf-8-sig", newline="") as stream:
            tables[table] = {int(row["ID"]): row for row in csv.DictReader(stream)}
        sources.append({key: source[key] for key in ("fileName", "sha256", "url")})
    entries = []
    for item_id, row in sorted(tables["ItemSparse"].items()):
        flags = int(row["Flags_0"])
        item = tables["Item"].get(item_id)
        if (
            item is not None
            and int(item["ClassID"]) in (2, 4)
            and int(row["OverallQualityID"]) in (2, 3, 4)
            and flags & 0x8000
        ):
            entries.append({"itemId": item_id, "flags": flags})
    return {
        "build": manifest["build"],
        "fileName": sources[1]["fileName"],
        "sha256": sources[1]["sha256"],
        "sources": sources,
        "field": "Flags_0",
        "mask": 0x8000,
        "coverage": "All weapon/armor rows of uncommon, rare or epic quality in the pinned CSV; no ilvl filter.",
        "entries": entries,
    }


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[1]
    for game_version in ("classic", "tbc"):
        snapshot = build(game_version, project_root)
        target = project_root / f"src/domain/disenchanting-{game_version}-exclusions.json"
        target.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8", newline="\n",
        )
        print(f"{game_version}: {len(snapshot['entries'])} exclusions")
