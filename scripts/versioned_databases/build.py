"""Rebuild versioned reference databases from hashed, pinned CSV manifests."""

import argparse
import collections
import csv
import hashlib
import json
import math
import pathlib
import subprocess

from sources import ROOT, WORK, TABLES, save_json

PROFESSIONS = {
    129: "first-aid", 164: "blacksmithing", 165: "leatherworking", 171: "alchemy",
    182: "herbalism", 185: "cooking", 186: "mining", 197: "tailoring",
    202: "engineering", 333: "enchanting", 356: "fishing", 393: "skinning",
    755: "jewelcrafting",
}
# Explicit adapters for the three inspected source layouts. Unknown builds fail closed.
ADAPTERS = {
    "1.14.4.51829": {"base": "EffectBasePoints", "scaling": None,
                     "race": ["RaceMask"], "skillup": "SkillupSkillLineID"},
    "2.5.6.69795": {"base": "EffectBasePoints", "scaling": None,
                     "race": ["RaceMask_0", "RaceMask_1"], "skillup": None},
    "1.60.1.70338": {"base": "EffectBasePointsF", "scaling": "ScalingClass",
                      "race": ["RaceMasks_0", "RaceMasks_1"], "skillup": "SkillupSkillLineID"},
}
IDENTITIES = {
    "1.14.4.51829": ("classic", "era", "wow_classic_era"),
    "2.5.6.69795": ("tbc", "anniversary", "wow_anniversary"),
    "1.60.1.70338": ("forever", "beta", "wow_classic_beta"),
}


def integer(value):
    if not isinstance(value, str) or not value.lstrip("-").isdigit():
        raise ValueError(f"Invalid integer cell: {value!r}")
    return int(value)


def number(value):
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"Invalid numeric cell: {value!r}")
    return int(result) if result.is_integer() else result


def nullable_copper(value):
    if value == "":
        return None
    result = integer(value)
    if result < 0:
        raise ValueError("Negative vendor price")
    return result


def read_csv(path, required):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)) or not set(required) <= set(headers):
            raise ValueError(f"Invalid headers in {path.name}: missing {set(required) - set(headers)}")
        rows = {}
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Malformed CSV row in {path.name}")
            key = integer(row["ID"])
            if key <= 0 or key in rows:
                raise ValueError(f"Invalid or duplicate ID {key} in {path.name}")
            rows[key] = row
        return rows


def requirements(adapter):
    return {
        "Item": ["ID", "ClassID", "SubclassID", "IconFileDataID"],
        "ItemSparse": ["ID", "Display_lang", "RequiredLevel", "OverallQualityID", "Bonding", "BuyPrice", "SellPrice", "VendorStackCount"],
        "SkillLine": ["ID", "DisplayName_lang", "ParentSkillLineID"],
        "SkillLineAbility": ["ID", "SkillLine", "Spell", "MinSkillLineRank", "TrivialSkillLineRankLow", "TrivialSkillLineRankHigh", "NumSkillUps", "TradeSkillCategoryID", "AcquireMethod", "ClassMask", "Flags", *adapter["race"], *([adapter["skillup"]] if adapter["skillup"] else [])],
        "SpellEffect": ["ID", "SpellID", "Effect", "EffectItemType", "EffectIndex", "DifficultyID", "Variance", "EffectRealPointsPerLevel", adapter["base"], *([adapter["scaling"]] if adapter["scaling"] else [])],
        "SpellReagents": ["ID", "SpellID", *[f"Reagent_{i}" for i in range(8)], *[f"ReagentCount_{i}" for i in range(8)]],
        "SpellTotems": ["ID", "SpellID", "Totem_0", "Totem_1", "RequiredTotemCategoryID_0", "RequiredTotemCategoryID_1"],
    }


def load_tables(manifest):
    build = manifest["build"]
    adapter = ADAPTERS[build]
    identity = tuple(manifest[k] for k in ["gameVersion", "mode", "product"])
    if identity != IDENTITIES[build]:
        raise ValueError("Manifest identity does not match inspected adapter")
    if collections.Counter((s["table"], s["locale"]) for s in manifest["sources"]) != collections.Counter(TABLES):
        raise ValueError("Expected exactly eight tables/locales")
    tables = {}
    required = requirements(adapter)
    for source in manifest["sources"]:
        if source["build"] != build or source["product"] != manifest["product"]:
            raise ValueError("Mixed source builds/products")
        path = (ROOT / source["path"]).resolve()
        if not path.is_relative_to(WORK.resolve() / "raw"):
            raise ValueError("CSV must be inside data-preparation/raw")
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"SHA256 mismatch: {path.name}")
        rows = read_csv(path, required[source["table"]])
        if len(rows) != source["rows"]:
            raise ValueError(f"Row count mismatch: {path.name}")
        tables[(source["table"], source["locale"])] = rows
    return tables


def by_spell(rows, column="SpellID"):
    result = collections.defaultdict(list)
    for row in rows.values():
        result[integer(row[column])].append(row)
    return result


def root_skill(skill_id, skills):
    seen = set()
    while skill_id not in PROFESSIONS:
        if skill_id in seen:
            raise ValueError("SkillLine parent cycle")
        seen.add(skill_id)
        row = skills.get(skill_id)
        if row is None:
            return None
        skill_id = integer(row["ParentSkillLineID"])
        if skill_id == 0:
            return None
    return skill_id if skill_id in skills else None


def parse_reagents(row):
    result = []
    seen = set()
    for i in range(8):
        item_id = integer(row[f"Reagent_{i}"])
        quantity = integer(row[f"ReagentCount_{i}"])
        if item_id == 0 and quantity == 0:
            continue
        if item_id <= 0 or quantity <= 0:
            raise ValueError("invalid-reagent-quantity-or-id")
        if item_id in seen:
            raise ValueError("duplicate-reagent")
        seen.add(item_id)
        result.append({"itemId": item_id, "quantity": quantity})
    if not result:
        raise ValueError("no-consumed-reagents")
    return result


def compare_locales(ru, en, items):
    mismatches = []
    for key in sorted(ru.keys() & en.keys()):
        fields = sorted(k for k in ru[key].keys() | en[key].keys()
                        if not k.endswith("_lang") and ru[key].get(k) != en[key].get(k))
        if fields:
            mismatches.append({"itemId": key, "fields": fields})
    return {
        "missingRuRows": sorted(en.keys() - ru.keys()),
        "missingEnRows": sorted(ru.keys() - en.keys()),
        "sparseWithoutItem": sorted((ru.keys() | en.keys()) - items.keys()),
        "itemWithoutSparse": sorted(items.keys() - (ru.keys() | en.keys())),
        "nonLocalizedMismatches": mismatches,
    }


def statistics(items, recipes, excluded, reagent_sources=()):
    products = {r["productItemId"] for r in recipes.values()}
    reagents = {v["itemId"] for r in recipes.values() for v in r["reagents"]}
    reagents.update(v["itemId"] for source in reagent_sources for v in source["reagents"])
    return {
        "items": len(items), "recipes": len(recipes), "craftedItems": len(products),
        "recipesWithTools": sum(bool(r["tools"]["itemIds"] or r["tools"]["categoryIds"]) for r in recipes.values()),
        "recipesWithBaseQuantityCandidate": sum(r["output"]["baseQuantityCandidate"] is not None for r in recipes.values()),
        "excludedRecipeEffects": len(excluded),
        "recipesByProfession": dict(sorted(collections.Counter(r["profession"] for r in recipes.values()).items())),
        "reagentItems": len(reagents), "itemsBothCraftAndReagent": len(products & reagents),
    }


def convert(manifest, tables, icons=None):
    adapter = ADAPTERS[manifest["build"]]
    item_rows = tables[("Item", "enUS")]
    ru = tables[("ItemSparse", "ruRU")]
    en = tables[("ItemSparse", "enUS")]
    skills = tables[("SkillLine", "ruRU")]
    abilities = by_spell(tables[("SkillLineAbility", "enUS")], "Spell")
    reagents = by_spell(tables[("SpellReagents", "enUS")])
    totems = by_spell(tables[("SpellTotems", "enUS")])
    localization = compare_locales(ru, en, item_rows)
    mismatch_ids = {v["itemId"] for v in localization["nonLocalizedMismatches"]}
    available = (ru.keys() | en.keys()) & item_rows.keys()
    effects = collections.defaultdict(list)
    for effect in tables[("SpellEffect", "enUS")].values():
        if integer(effect["Effect"]) == 24 and integer(effect["EffectItemType"]) > 0:
            effects[integer(effect["SpellID"])].append(effect)
    recipes = {}
    excluded = []
    for spell_id, spell_effects in sorted(effects.items()):
        linked = [(root_skill(integer(a["SkillLine"]), skills), a) for a in abilities.get(spell_id, [])]
        linked = [(s, a) for s, a in linked if s is not None]
        if not linked:
            continue
        def reject(reason, **details):
            excluded.append({"spellId": spell_id, "reason": reason, **details})
        if len(spell_effects) != 1:
            reject("multiple-create-item-effects", effectRowIds=sorted(integer(e["ID"]) for e in spell_effects))
            continue
        if len({s for s, _ in linked}) != 1:
            reject("ambiguous-profession", skillLineIds=sorted({s for s, _ in linked}))
            continue
        if len(reagents.get(spell_id, [])) != 1:
            reject("missing-or-ambiguous-reagents")
            continue
        if len(totems.get(spell_id, [])) > 1:
            reject("ambiguous-tools")
            continue
        try:
            ingredients = parse_reagents(reagents[spell_id][0])
        except ValueError as error:
            reject(str(error))
            continue
        effect = spell_effects[0]
        product = integer(effect["EffectItemType"])
        needed = {product, *[r["itemId"] for r in ingredients]}
        missing = sorted(needed - available)
        if missing:
            reject("missing-items", itemIds=missing)
            continue
        if needed & mismatch_ids:
            reject("nonlocalized-item-conflict", itemIds=sorted(needed & mismatch_ids))
            continue
        if any(not (ru.get(i, {}).get("Display_lang") or en.get(i, {}).get("Display_lang")) for i in needed):
            reject("missing-both-names")
            continue
        linked.sort(key=lambda pair: integer(pair[1]["ID"]))
        skill, ability = linked[0]
        base = number(effect[adapter["base"]])
        variance = number(effect["Variance"])
        real = number(effect["EffectRealPointsPerLevel"])
        scaling = integer(effect[adapter["scaling"]]) if adapter["scaling"] else None
        candidate = base if isinstance(base, int) and base > 0 and variance == 0 and real == 0 and scaling in (None, 0) else None
        tools = {"itemIds": [], "categoryIds": []}
        if spell_id in totems:
            row = totems[spell_id][0]
            for field, prefix in [("itemIds", "Totem"), ("categoryIds", "RequiredTotemCategoryID")]:
                values = [integer(row[f"{prefix}_{i}"]) for i in range(2)]
                if any(v < 0 for v in values):
                    raise ValueError("Negative tool requirement")
                # Preserve the two source slots, including repeated categories.
                tools[field] = [v for v in values if v > 0]
        recipe = {
            "spellId": spell_id, "productItemId": product, "profession": PROFESSIONS[skill],
            "skillLineId": skill, "reagents": ingredients,
            "output": {"quantity": None, "baseQuantityCandidate": candidate, "status": "requires-validation",
                       "basePoints": base, "variance": variance, "realPointsPerLevel": real, "scalingClass": scaling,
                       "rawEffectParameters": {k: v for k, v in sorted(effect.items()) if k not in ["ID", "SpellID"]}},
            "tools": tools,
            "skillMetadata": {
                "minimumRankRaw": integer(ability["MinSkillLineRank"]),
                "trivialRankLowRaw": integer(ability["TrivialSkillLineRankLow"]),
                "trivialRankHighRaw": integer(ability["TrivialSkillLineRankHigh"]),
                "skillUpsRaw": integer(ability["NumSkillUps"]),
                "categoryId": integer(ability["TradeSkillCategoryID"]),
                "skillupSkillLineId": integer(ability[adapter["skillup"]]) if adapter["skillup"] else None,
                "acquireMethodRaw": integer(ability["AcquireMethod"]),
                "classMaskRaw": integer(ability["ClassMask"]),
                "raceMaskPartsRaw": [integer(ability[k]) for k in adapter["race"]],
                "flagsRaw": integer(ability["Flags"]),
            },
            "source": {"effectRowId": integer(effect["ID"]), "effectIndex": integer(effect["EffectIndex"]),
                       "difficultyId": integer(effect["DifficultyID"]), "reagentsRowId": integer(reagents[spell_id][0]["ID"]),
                       "abilityRowIds": [integer(a["ID"]) for _, a in linked]},
        }
        recipes[str(spell_id)] = recipe
    referenced = {r["productItemId"] for r in recipes.values()} | {v["itemId"] for r in recipes.values() for v in r["reagents"]}
    # Enchantments consume materials without producing an item. Keep their
    # provenance separately rather than inventing a craftable product.
    reagent_sources = []
    all_effects = by_spell(tables[("SpellEffect", "enUS")])
    conversions = []
    for spell_id, rows in sorted(all_effects.items()):
        linked = abilities.get(spell_id, [])
        enchantments = [e for e in rows if integer(e["Effect"]) == 53]
        roots = {root_skill(integer(a["SkillLine"]), skills) for a in linked}
        kind, product, effect = None, None, None
        if enchantments and roots == {333} and spell_id not in effects:
            kind, effect = "enchantment", enchantments[0]
        elif not linked and len(effects.get(spell_id, [])) == 1:
            effect = effects[spell_id][0]
            product = integer(effect["EffectItemType"])
            kind = "item-conversion"
        if kind is None or len(reagents.get(spell_id, [])) != 1:
            continue
        try:
            ingredients = parse_reagents(reagents[spell_id][0])
        except ValueError:
            continue
        needed = {r["itemId"] for r in ingredients} | ({product} if product else set())
        if needed - available or needed & mismatch_ids:
            continue
        if any(not (ru.get(i, {}).get("Display_lang") or en.get(i, {}).get("Display_lang")) for i in needed):
            continue
        source = {
            "spellId": spell_id, "kind": kind, "productItemId": product,
            "profession": "enchanting" if kind == "enchantment" else None,
            "reagents": ingredients,
            "source": {"effectRowId": integer(effect["ID"]),
                       "reagentsRowId": integer(reagents[spell_id][0]["ID"]),
                       "abilityRowIds": sorted(integer(a["ID"]) for a in linked)},
        }
        if kind == "enchantment":
            reagent_sources.append(source)
            referenced.update(needed)
        # Restrict unlinked conversions to a single trade-goods ingredient and
        # a trade-goods product already connected to this profession catalog.
        elif len(ingredients) == 1 and all(integer(item_rows[i]["ClassID"]) == 7 for i in needed):
            conversions.append(source)
    while conversions:
        pending = []
        for source in conversions:
            if source["productItemId"] in referenced:
                reagent_sources.append(source)
                referenced.update(r["itemId"] for r in source["reagents"])
            else:
                pending.append(source)
        if len(pending) == len(conversions):
            break
        conversions = pending
    reagent_sources.sort(key=lambda source: source["spellId"])
    reverse = collections.defaultdict(list)
    for r in recipes.values():
        reverse[r["productItemId"]].append(r["spellId"])
    items = {}
    for item_id in sorted(referenced):
        row = en.get(item_id) or ru[item_id]
        stack = integer(row["VendorStackCount"]) if row["VendorStackCount"] else None
        if stack is not None and stack < 0:
            raise ValueError("Negative vendor stack")
        items[str(item_id)] = {
            "itemId": item_id, "names": {"ru": ru.get(item_id, {}).get("Display_lang") or None, "en": en.get(item_id, {}).get("Display_lang") or None},
            "iconUrl": (icons or {}).get(str(item_id), ""),
            "requiredLevel": integer(row["RequiredLevel"]),
            "qualityId": integer(row["OverallQualityID"]), "recipeSpellIds": reverse[item_id],
            "vendor": {"baseBuyPriceCopper": nullable_copper(row["BuyPrice"]), "sellPriceCopper": nullable_copper(row["SellPrice"]), "stackCount": stack, "availability": None},
            "bondingId": integer(row["Bonding"]),
        }
    professions = {str(s): {"id": p, "skillLineId": s, "nameRu": skills[s]["DisplayName_lang"]}
                   for s, p in sorted(PROFESSIONS.items()) if s in skills}
    db = {
        "format": "craftcalc-reference-database", "schemaVersion": 2,
        "gameVersion": manifest["gameVersion"], "mode": manifest["mode"], "build": manifest["build"],
        "product": manifest["product"], "snapshotDate": manifest["snapshotDate"],
        "locales": manifest["locales"], "sources": manifest["sources"],
        "selection": {"status": "client-table-candidates", "effect": 24,
                      "rules": ["Profession-linked CREATE_ITEM effects with a single unambiguous product and complete positive consumed reagents.",
                                "Items are exactly the union of recipe products, recipe reagents and additional reagentSources; tools remain external references.",
                                "Additional reagents come from profession-linked enchantments and single-ingredient trade-goods conversions leading to catalog items; conversions are not crafting recipes.",
                                ("Classic uses the pre-SoD Era snapshot 1.14.4.51829." if manifest["gameVersion"] == "classic" else "Independent tables from this dataset's product and build."),
                                "No item data, translations or icon responses are borrowed from another version."],
                      "availability": "Not exhaustively verified: client presence does not prove player availability; hidden/test recipes can remain."},
        "itemScope": "recipe-products-and-profession-reagents",
        "reagentSources": reagent_sources,
        "iconSource": {"provider": "Wowhead", "version": manifest["gameVersion"],
                       "endpoint": f"https://nether.wowhead.com/{manifest['gameVersion']}/tooltip/item/{{itemId}}", "imagesDownloaded": False},
        "notes": ["Standalone reference data; schema 2 is not connected to the application's schema 1 loader.",
                  "Output quantity remains unknown; raw effect parameters and an unverified base candidate are preserved without adding one.",
                  "BuyPrice and VendorStackCount are retained verbatim: stack price semantics are unconfirmed; no multiplication/division applied. Prices are copper source values, not vendor availability.",
                  "Alternative spell recipes and cycles are allowed; ordinary enchantments contribute consumed reagents, not crafting recipes.",
                  "Skill minimum rank is raw client data, not a verified learning requirement. Tool categories require a separate TotemCategory lookup."],
        "statistics": statistics(items, recipes, excluded, reagent_sources),
        "professions": professions, "items": items, "recipes": recipes, "excludedRecipeEffects": excluded,
    }
    report = {"identity": {k: db[k] for k in ["gameVersion", "mode", "build", "product", "snapshotDate"]},
              "schemaVersion": 2, "sources": manifest["sources"],
              "sourceManifest": f"data-preparation/manifests/{manifest['gameVersion']}.{manifest['build']}.json",
              "selection": db["selection"], "iconSource": db["iconSource"],
              "statistics": db["statistics"], "localization": localization,
              "missingTranslations": [{"itemId": i["itemId"], "locale": locale} for i in items.values() for locale in ["ru", "en"] if i["names"][locale] is None],
              "missingIcons": [i["itemId"] for i in items.values() if not i["iconUrl"]],
              "unknownOutput": [r["spellId"] for r in recipes.values() if r["output"]["quantity"] is None],
              "excludedRecipeEffects": excluded,
              "availabilityReview": {
                  "status": "client-table-candidates",
                  "seasonalBoundary": "Pre-SoD Era source snapshot; no post-2023 tables used." if manifest["gameVersion"] == "classic" else "Independent version-specific source snapshot.",
                  "unverifiedSuspiciousNames": [{"itemId": i["itemId"], "nameEn": i["names"]["en"], "reason": "Source name suggests hidden/deprecated data; availability not confirmed, record retained as a candidate."}
                                                for i in items.values() if any(word in (i["names"]["en"] or "").lower() for word in ["deprecated", "[old]", "test ", "unused"])],
                  "limitation": "No exhaustive acquisition/availability source was applied. Absence of suspicious names does not prove availability."}}
    return db, report


def prettier(path):
    # Staging is ignored during repository-wide checks. Format its content via stdin
    # so ignore rules cannot silently skip the file before it is released.
    result = subprocess.run(
        ["node", str(ROOT / "node_modules/prettier/bin/prettier.cjs"), "--parser", "json"],
        input=path.read_text(encoding="utf-8"), encoding="utf-8", cwd=ROOT,
        check=True, capture_output=True,
    )
    path.write_text(result.stdout, encoding="utf-8", newline="\n")


def rebuild(manifest_path):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tables = load_tables(manifest)
    icons_path = WORK / "cache" / manifest["gameVersion"] / "icons.json"
    icons = {}
    if manifest["gameVersion"] == "forever":
        old = json.loads((ROOT / "public/data/craftcalc-db.1.60.1.70338.json").read_text(encoding="utf-8"))
        if old["build"] != manifest["build"] or old["iconSource"]["version"] != "forever":
            raise ValueError("Wrong Forever icon reuse identity")
        icons = {k: v["iconUrl"] for k, v in old["items"].items()}
    if icons_path.exists():
        cache = json.loads(icons_path.read_text(encoding="utf-8"))
        if cache["gameVersion"] != manifest["gameVersion"]:
            raise ValueError("Wrong icon cache version")
        # A failed/name-mismatched lookup must clear even a previously reused URL.
        for key, value in cache["items"].items():
            expected = tables[("ItemSparse", "enUS")].get(int(key), {}).get("Display_lang") or None
            if value["itemId"] != int(key) or value["expectedName"] != expected:
                continue
            icons[key] = value["iconUrl"]
    db, report = convert(manifest, tables, icons)
    stem = f"{db['gameVersion']}.{db['build']}"
    path = WORK / "staging" / f"craftcalc-db.{stem}.json"
    save_json(path, db)
    prettier(path)
    subprocess.run(["node", str(ROOT / "scripts/versioned_databases/contract.mjs"), str(path)], cwd=ROOT, check=True)
    if db["gameVersion"] == "forever":
        comparison = {}
        for section in ["items", "recipes", "professions"]:
            changes = []
            for key in sorted(set(old[section]) | set(db[section]), key=int):
                before, after = old[section].get(key), db[section].get(key)
                if section == "items" and after is not None:
                    # Schema 1 never stored RequiredLevel. Compare every original
                    # field; the new field is validated against this build's CSV.
                    after = {k: v for k, v in after.items() if k != "requiredLevel"}
                if section == "recipes" and after is not None:
                    after = {**after, "output": {k: v for k, v in after["output"].items() if k != "rawEffectParameters"}}
                if before != after:
                    changes.append({"id": int(key), "before": before, "after": after})
            comparison[section] = changes
        report["foreverReproduction"] = comparison
        # The legacy catalog remains a verified subset after broadening reagent
        # selection. Existing items and every crafting recipe must be unchanged.
        comparison["items"] = [change for change in comparison["items"] if change["before"] is not None]
        report["additionalItemIds"] = sorted(int(k) for k in db["items"].keys() - old["items"].keys())
        if any(comparison.values()) or len(db["recipes"]) != 1984:
            raise ValueError("Forever reproduction differs; inspect converter before release")
    report["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    report["file"] = path.relative_to(ROOT).as_posix()
    report_path = WORK / "reports" / f"{stem}.json"
    save_json(report_path, report)
    prettier(report_path)
    print(stem, db["statistics"], "sha256", report["sha256"])
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=pathlib.Path)
    args = parser.parse_args()
    rebuild(args.manifest)
