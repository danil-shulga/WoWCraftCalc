"""Validate and reproduce all datasets before copying any of them into public."""

import hashlib
import itertools
import json
import shutil
import subprocess

from build import prettier, rebuild
from sources import ROOT, WORK, save_json

BUILDS = {"classic": "1.14.4.51829", "tbc": "2.5.6.69795", "forever": "1.60.1.70338"}


def release():
    originals = hashlib.sha256((ROOT / "public/data/craftcalc-db.1.60.1.70338.json").read_bytes()).hexdigest()
    prepared = {}
    checks = []
    # Every preparation/verification finishes before the first public mutation.
    for version, build in BUILDS.items():
        path = rebuild(WORK / "manifests" / f"{version}.{build}.json")
        before = path.read_bytes()
        rebuild(WORK / "manifests" / f"{version}.{build}.json")
        if path.read_bytes() != before:
            raise ValueError(f"Non-reproducible JSON: {version}")
        db = json.loads(before)
        sample_report = json.loads((WORK / "reports" / f"samples.{version}.{build}.json").read_text(encoding="utf-8"))
        if sample_report["gameVersion"] != version or sample_report["build"] != build:
            raise ValueError("Sample report identity mismatch")
        if len(sample_report["recipes"]) < 3 or not all(s["matches"] for s in sample_report["recipes"]):
            raise ValueError("Sample checks incomplete")
        if len(sample_report["iconHttpChecks"]) < 3:
            raise ValueError("Image HTTP checks incomplete")
        for image in sample_report["iconHttpChecks"]:
            if image["httpStatus"] != 200 or not image["contentType"].startswith("image/") or db["items"][str(image["itemId"])]["iconUrl"] != image["url"]:
                raise ValueError("Image HTTP checks disagree with current database")
        if version != "forever":
            cache = json.loads((WORK / "cache" / version / "icons.json").read_text(encoding="utf-8"))
            if cache["gameVersion"] != version:
                raise ValueError("Wrong cache version")
            for key, item in db["items"].items():
                entry = cache["items"].get(key)
                if not entry or entry["itemId"] != item["itemId"] or entry["expectedName"] != item["names"]["en"]:
                    raise ValueError(f"Incomplete icon processing: {version}/{key}")
                if entry.get("httpStatus") in (403, 429) or entry["status"] == "network-error":
                    raise ValueError(f"Interrupted icon processing: {version}/{key}")
        prepared[version] = (path, db)
        checks.append({"gameVersion": version, "build": build, "byteIdenticalRebuild": True,
                       "schemaAndReferences": "passed", "itemScope": "passed", "sourcesSha256": "passed",
                       "sha256": hashlib.sha256(before).hexdigest(),
                       "missingIcons": sum(not i["iconUrl"] for i in db["items"].values()),
                       "missingTranslations": sum(i["names"][locale] is None for i in db["items"].values() for locale in ["ru", "en"]),
                       "unknownOutput": sum(r["output"]["quantity"] is None for r in db["recipes"].values()),
                       "statistics": db["statistics"]})
    comparisons = []
    for left, right in itertools.combinations(prepared, 2):
        a, b = prepared[left][1], prepared[right][1]
        shared = sorted(a["items"].keys() & b["items"].keys(), key=int)
        differences = {}
        for field in ["names", "vendor", "requiredLevel", "qualityId", "itemLevel", "classId", "subclassId", "inventoryType", "bondingId", "recipeSpellIds", "iconUrl"]:
            differences[field] = [int(key) for key in shared if a["items"][key][field] != b["items"][key][field]]
        common_spells = sorted(a["recipes"].keys() & b["recipes"].keys(), key=int)
        comparisons.append({"versions": [left, right], "sharedItemIds": len(shared),
                            "differentItemFields": differences, "sharedSpellIds": len(common_spells),
                            "differentRecipeIds": [int(key) for key in common_spells if a["recipes"][key] != b["recipes"][key]],
                            "note": "Separate records are preserved even where IDs coincide. No cross-version cache or localization borrowing."})
    for version, (path, db) in prepared.items():
        destination = ROOT / "public/data" / version / f"craftcalc-db.{db['build']}.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(".json.part")
        shutil.copyfile(path, temporary)
        temporary.replace(destination)
        report_path = WORK / "reports" / f"{version}.{db['build']}.json"
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["file"] = destination.relative_to(ROOT).as_posix()
        save_json(report_path, report)
        prettier(report_path)
        print("Released", report["file"], report["sha256"])
    if hashlib.sha256((ROOT / "public/data/craftcalc-db.1.60.1.70338.json").read_bytes()).hexdigest() != originals:
        raise ValueError("Original Forever changed")
    report_path = WORK / "reports" / "release.json"
    save_json(report_path, {"snapshotDate": "2026-10-12", "originalForeverSha256": originals,
                            "checks": checks, "crossVersionComparisons": comparisons,
                            "availabilityStatus": "client-table-candidates; exhaustive player availability validation deferred"})
    prettier(report_path)
    subprocess.run(["node", str(ROOT / "scripts/versioned_databases/contract.mjs"),
                    *[str(ROOT / "public/data" / version / f"craftcalc-db.{build}.json") for version, build in BUILDS.items()]], cwd=ROOT, check=True)


if __name__ == "__main__":
    release()
