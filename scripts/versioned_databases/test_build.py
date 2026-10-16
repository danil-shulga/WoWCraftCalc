import copy
import pathlib
import tempfile
import unittest

from build import ADAPTERS, convert, integer, nullable_copper, parse_reagents, read_csv
from sources import ROOT, WORK


def fixture():
    manifest = {"gameVersion": "forever", "build": "1.60.1.70338", "mode": "beta",
                "product": "wow_classic_beta", "snapshotDate": "2026-10-12",
                "locales": ["ruRU", "enUS"], "sources": []}
    item = {"ID": "1", "Display_lang": "Product", "OverallQualityID": "1", "Bonding": "0",
            "BuyPrice": "0", "SellPrice": "", "VendorStackCount": "5"}
    ability = {"ID": "10", "SkillLine": "171", "Spell": "100", "MinSkillLineRank": "1",
               "TrivialSkillLineRankLow": "2", "TrivialSkillLineRankHigh": "3", "NumSkillUps": "1",
               "TradeSkillCategoryID": "0", "SkillupSkillLineID": "0", "AcquireMethod": "1",
               "ClassMask": "0", "RaceMasks_0": "0", "RaceMasks_1": "0", "Flags": "0"}
    reagent = {"ID": "20", "SpellID": "100", **{f"Reagent_{i}": "0" for i in range(8)},
               **{f"ReagentCount_{i}": "0" for i in range(8)}, "Reagent_0": "2", "ReagentCount_0": "3"}
    effect = {"ID": "30", "SpellID": "100", "Effect": "24", "EffectItemType": "1", "EffectIndex": "0",
              "DifficultyID": "0", "EffectBasePointsF": "0", "Variance": "0", "EffectRealPointsPerLevel": "0", "ScalingClass": "0"}
    tables = {
        ("Item", "enUS"): {i: {"ID": str(i)} for i in [1, 2, 999]},
        ("ItemSparse", "enUS"): {i: {**item, "ID": str(i)} for i in [1, 2, 999]},
        ("ItemSparse", "ruRU"): {i: {**item, "ID": str(i), "Display_lang": "Предмет"} for i in [1, 2, 999]},
        ("SkillLine", "ruRU"): {171: {"ID": "171", "DisplayName_lang": "Алхимия", "ParentSkillLineID": "0"}},
        ("SkillLineAbility", "enUS"): {10: ability},
        ("SpellReagents", "enUS"): {20: reagent},
        ("SpellEffect", "enUS"): {30: effect},
        ("SpellTotems", "enUS"): {40: {"ID": "40", "SpellID": "100", "Totem_0": "999", "Totem_1": "0", "RequiredTotemCategoryID_0": "14", "RequiredTotemCategoryID_1": "14"}},
    }
    return manifest, tables


class ConverterTests(unittest.TestCase):
    def test_enchantments_and_connected_conversions_add_reagents_not_recipes(self):
        manifest, tables = fixture()
        tables[("SkillLine", "ruRU")][333] = {"ID": "333", "DisplayName_lang": "Enchanting", "ParentSkillLineID": "0"}
        for i in [1, 2, 999]:
            tables[("Item", "enUS")][i]["ClassID"] = "7"
        # The enchantment is the only consumer of item 999.
        tables[("SkillLineAbility", "enUS")][11] = {**tables[("SkillLineAbility", "enUS")][10], "ID": "11", "Spell": "101", "SkillLine": "333"}
        tables[("SpellEffect", "enUS")][31] = {**tables[("SpellEffect", "enUS")][30], "ID": "31", "SpellID": "101", "Effect": "53", "EffectItemType": "0"}
        tables[("SpellReagents", "enUS")][21] = {**tables[("SpellReagents", "enUS")][20], "ID": "21", "SpellID": "101", "Reagent_0": "999"}
        # A conversion has no profession, but produces an existing catalog item.
        tables[("SpellEffect", "enUS")][32] = {**tables[("SpellEffect", "enUS")][30], "ID": "32", "SpellID": "102", "EffectItemType": "2"}
        tables[("SpellReagents", "enUS")][22] = {**tables[("SpellReagents", "enUS")][21], "ID": "22", "SpellID": "102"}
        db, _ = convert(manifest, tables)
        self.assertEqual(set(db["items"]), {"1", "2", "999"})
        self.assertEqual(set(db["recipes"]), {"100"})
        self.assertEqual(db["items"]["999"]["recipeSpellIds"], [])
        self.assertEqual([s["kind"] for s in db["reagentSources"]], ["enchantment", "item-conversion"])
        self.assertEqual(db["statistics"]["reagentItems"], 2)
        conversion_only = copy.deepcopy(tables)
        del conversion_only[("SkillLineAbility", "enUS")][11]
        result, _ = convert(manifest, conversion_only)
        self.assertIn("999", result["items"])
        self.assertEqual([s["kind"] for s in result["reagentSources"]], ["item-conversion"])
        # Invalid, missing and locale-conflicting materials never enter scope.
        for mutation in ["quantity", "missing", "conflict", "unlinked", "other-effect", "non-trade-goods"]:
            changed = copy.deepcopy(tables)
            if mutation == "quantity":
                for i in [21, 22]:
                    changed[("SpellReagents", "enUS")][i]["ReagentCount_0"] = "0"
            elif mutation == "missing":
                del changed[("Item", "enUS")][999]
            elif mutation == "conflict":
                changed[("ItemSparse", "ruRU")][999]["BuyPrice"] = "1"
            else:
                del changed[("SkillLineAbility", "enUS")][11]
                if mutation == "unlinked":
                    changed[("SpellEffect", "enUS")][32]["EffectItemType"] = "999"
                    changed[("SpellReagents", "enUS")][22]["Reagent_0"] = "999"
                elif mutation == "other-effect":
                    changed[("SpellEffect", "enUS")][32]["Effect"] = "53"
                else:
                    changed[("Item", "enUS")][999]["ClassID"] = "0"
            with self.subTest(mutation=mutation):
                result, _ = convert(manifest, changed)
                self.assertNotIn("999", result["items"])
                self.assertEqual(result["reagentSources"], [])

    def test_scope_tools_prices_and_unknown_output(self):
        db, _ = convert(*fixture())
        self.assertEqual(set(db["items"]), {"1", "2"})
        self.assertEqual(len(db["items"]["1"]), 7)
        self.assertEqual(db["recipes"]["100"]["tools"], {"itemIds": [999], "categoryIds": [14, 14]})
        self.assertIsNone(db["recipes"]["100"]["output"]["quantity"])
        self.assertIsNone(db["recipes"]["100"]["output"]["baseQuantityCandidate"])
        self.assertEqual(db["items"]["1"]["vendor"]["baseBuyPriceCopper"], 0)
        self.assertIsNone(db["items"]["1"]["vendor"]["sellPriceCopper"])
        self.assertEqual(db["items"]["1"]["vendor"]["stackCount"], 5)

    def test_alternative_recipes_and_child_skill(self):
        manifest, tables = fixture()
        tables[("SkillLine", "ruRU")][9999] = {"ID": "9999", "ParentSkillLineID": "171"}
        tables[("SkillLineAbility", "enUS")][10]["SkillLine"] = "9999"
        for table, row_id in [("SkillLineAbility", 10), ("SpellReagents", 20), ("SpellEffect", 30)]:
            row = copy.deepcopy(tables[(table, "enUS")][row_id])
            row["ID"] = str(row_id + 1)
            row["Spell" if table == "SkillLineAbility" else "SpellID"] = "101"
            tables[(table, "enUS")][row_id + 1] = row
        db, _ = convert(manifest, tables)
        self.assertEqual(db["items"]["1"]["recipeSpellIds"], [100, 101])
        self.assertEqual(db["recipes"]["100"]["skillLineId"], 171)

    def test_invalid_composition_excluded_entirely(self):
        for field, value, reason in [("ReagentCount_0", "0", "invalid-reagent-quantity-or-id"),
                                     ("ReagentCount_0", "-1", "invalid-reagent-quantity-or-id"),
                                     ("Reagent_1", "2", "duplicate-reagent")]:
            with self.subTest(field=field, value=value):
                manifest, tables = fixture()
                row = tables[("SpellReagents", "enUS")][20]
                row["ReagentCount_1"] = "1" if field == "Reagent_1" else "0"
                row[field] = value
                db, report = convert(manifest, tables)
                self.assertFalse(db["recipes"])
                self.assertFalse(db["items"])
                self.assertEqual(report["excludedRecipeEffects"][0]["reason"], reason)
        with self.assertRaises(ValueError):
            integer("1.5")

    def test_missing_item_and_locale_conflict(self):
        for mutation in ["missing", "conflict"]:
            manifest, tables = fixture()
            if mutation == "missing":
                del tables[("Item", "enUS")][2]
            else:
                tables[("ItemSparse", "ruRU")][2]["BuyPrice"] = "1"
            db, report = convert(manifest, tables)
            self.assertFalse(db["recipes"])
            self.assertEqual(len(report["excludedRecipeEffects"]), 1)

    def test_missing_translation_does_not_borrow(self):
        manifest, tables = fixture()
        del tables[("ItemSparse", "ruRU")][2]
        db, report = convert(manifest, tables)
        self.assertIsNone(db["items"]["2"]["names"]["ru"])
        self.assertEqual(report["missingTranslations"], [{"itemId": 2, "locale": "ru"}])

    def test_variable_base_never_becomes_fixed_quantity(self):
        manifest, tables = fixture()
        effect = tables[("SpellEffect", "enUS")][30]
        effect["EffectBasePointsF"] = "5"
        effect["Variance"] = "0.5"
        db, _ = convert(manifest, tables)
        self.assertIsNone(db["recipes"]["100"]["output"]["baseQuantityCandidate"])
        self.assertIsNone(db["recipes"]["100"]["output"]["quantity"])

    def test_ambiguous_profession_and_product_fail_closed(self):
        for mutation in ["profession", "effect"]:
            manifest, tables = fixture()
            if mutation == "profession":
                tables[("SkillLine", "ruRU")][164] = {"ID": "164", "DisplayName_lang": "Кузнечное дело", "ParentSkillLineID": "0"}
                tables[("SkillLineAbility", "enUS")][11] = {**tables[("SkillLineAbility", "enUS")][10], "ID": "11", "SkillLine": "164"}
            else:
                tables[("SpellEffect", "enUS")][31] = {**tables[("SpellEffect", "enUS")][30], "ID": "31", "EffectItemType": "2"}
            db, _ = convert(manifest, tables)
            self.assertFalse(db["recipes"])

    def test_missing_headers_duplicate_ids_and_invalid_price(self):
        (WORK / "raw").mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=WORK / "raw") as folder:
            self.assertTrue(pathlib.Path(folder).resolve().is_relative_to(ROOT))
            path = pathlib.Path(folder) / "test.csv"
            for content in ["ID,Name\n1,x\n", "ID,BuyPrice\n1,0\n1,5\n"]:
                path.write_text(content, encoding="utf-8")
                with self.assertRaises(ValueError):
                    read_csv(path, ["ID", "BuyPrice"])
        self.assertIsNone(nullable_copper(""))
        self.assertEqual(nullable_copper("0"), 0)
        with self.assertRaises(ValueError):
            nullable_copper("-1")
        with self.assertRaises(KeyError):
            ADAPTERS["unknown"]


if __name__ == "__main__":
    unittest.main()
