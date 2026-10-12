"""Pinned Wago downloads and manifests; no application dependencies."""

import argparse
import csv
import hashlib
import io
import json
import pathlib
import shutil
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / "data-preparation"
USER_AGENT = "CraftCalc data preparation/1.0"
TABLES = [
    ("Item", "enUS"),
    ("ItemSparse", "ruRU"),
    ("ItemSparse", "enUS"),
    ("SpellReagents", "enUS"),
    ("SpellEffect", "enUS"),
    ("SkillLineAbility", "enUS"),
    ("SkillLine", "ruRU"),
    ("SpellTotems", "enUS"),
]


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def discover():
    url = "https://wago.tools/api/builds"
    builds = json.loads(fetch(url))
    save_json(WORK / "raw" / "wago-builds.2026-10-12.json", builds)
    for product in ["wow_classic_era", "wow_anniversary", "wow_classic_beta"]:
        print(product, [(b["version"], b["created_at"]) for b in builds[product][:3]])
    return builds


def acquire(version, mode, product, build, import_dir=None):
    builds = json.loads((WORK / "raw" / "wago-builds.2026-10-12.json").read_text(encoding="utf-8"))
    matches = [b for b in builds[product] if b["version"] == build]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one {product}/{build} in pinned Wago build list")
    folder = WORK / "raw" / version / build
    folder.mkdir(parents=True, exist_ok=True)
    legacy = {
        ("ItemSparse", "ruRU"): f"ItemSparse.{build} (1).csv",
        ("ItemSparse", "enUS"): f"ItemSparse.{build}.csv",
        ("SkillLineAbility", "enUS"): f"SkillLineAbility.{build} (1).csv",
    }
    sources = []
    for table, locale in TABLES:
        filename = f"{table}.{locale}.{build}.csv"
        path = folder / filename
        url = f"https://wago.tools/db2/{table}/csv?build={build}&locale={locale}"
        original = legacy.get((table, locale), f"{table}.{build}.csv") if import_dir else None
        if not path.exists():
            if import_dir:
                shutil.copyfile(pathlib.Path(import_dir) / original, path)
            else:
                # Any HTTP error stops the batch, including 403/429. No version fallback.
                data = fetch(url)
                if data.lstrip().startswith(b"<"):
                    raise ValueError(f"HTML instead of CSV: {url}")
                temporary = path.with_suffix(".csv.part")
                temporary.write_bytes(data)
                temporary.replace(path)
                time.sleep(0.5)
        data = path.read_bytes()
        reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
        if not reader.fieldnames or "ID" not in reader.fieldnames:
            raise ValueError(f"Missing CSV ID header: {path}")
        count = sum(1 for _ in reader)
        source = {
            "table": table, "locale": locale, "fileName": filename,
            "path": path.relative_to(ROOT).as_posix(), "rows": count,
            "sha256": hashlib.sha256(data).hexdigest(), "url": url,
            "product": product, "build": build,
        }
        if original:
            source["originalFileName"] = original
        sources.append(source)
        print(version, filename, count, source["sha256"])
    manifest = {
        "gameVersion": version, "mode": mode, "product": product, "build": build,
        "snapshotDate": "2026-10-12", "locales": ["ruRU", "enUS"],
        "sourceUrl": "https://wago.tools/db2", "buildEvidence": matches[0],
        "buildListUrl": "https://wago.tools/api/builds", "sources": sources,
    }
    save_json(WORK / "manifests" / f"{version}.{build}.json", manifest)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--version", choices=["classic", "tbc", "forever"])
    parser.add_argument("--mode")
    parser.add_argument("--product")
    parser.add_argument("--build")
    parser.add_argument("--import-dir")
    args = parser.parse_args()
    if args.discover:
        discover()
    else:
        if not all([args.version, args.mode, args.product, args.build]):
            parser.error("--version, --mode, --product and --build are required")
        acquire(args.version, args.mode, args.product, args.build, args.import_dir)
