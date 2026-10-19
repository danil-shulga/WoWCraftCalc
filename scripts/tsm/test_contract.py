import unittest
from contract import MARKETS, encode_snapshot, market_key, market_url, parse_csv, validate_snapshot

HEADER = "itemId,name,marketValue,minBuyout,recent,historical,updatedAt\n"
ROW = '21877,"Netherweave, Cloth",1708,0,2322,0,2026-01-01T00:00:00Z\n'
ERA_ROW = '25,Worn Shortsword,946620,0,0,0,\n'

class ContractTests(unittest.TestCase):
    def test_era_without_scan_times_keeps_prices_and_unknown_time(self):
        market = next(market for market in MARKETS if market.get("version") == "classic")
        snapshot = parse_csv(HEADER + ERA_ROW + '118,Minor Healing Potion,18,14,17,0,\n', market)
        self.assertIsNone(snapshot["scannedAt"])
        self.assertEqual(snapshot["items"]["25"], dict(recent=None, marketValue=946620))
        self.assertEqual(snapshot["items"]["118"], dict(recent=17, marketValue=18))
        self.assertEqual(validate_snapshot(snapshot, market), snapshot)

    def test_missing_scan_time_is_only_allowed_for_uniform_era_exports(self):
        classic = next(market for market in MARKETS if market.get("version") == "classic")
        with self.assertRaises(ValueError):
            parse_csv(HEADER + ERA_ROW, MARKETS[0])
        for raw in [HEADER + ERA_ROW + ROW, HEADER + ROW + ERA_ROW,
                    HEADER + ERA_ROW.replace('0,0,0,\n', '0,0,0,bad\n'),
                    HEADER + ERA_ROW.replace('946620', '-1')]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_csv(raw, classic)
        snapshot = parse_csv(HEADER + ROW, MARKETS[0])
        snapshot["scannedAt"] = None
        with self.assertRaises(ValueError):
            validate_snapshot(snapshot, MARKETS[0])

    def test_classic_and_tbc_are_separate_markets(self):
        classic = next(market for market in MARKETS if market.get("version") == "classic")
        tbc = MARKETS[0]
        self.assertTrue(market_key(classic).startswith("classic-"))
        self.assertIn(f'/classic/{classic["region"]}/', market_url(classic))
        self.assertIn(f'/classic/{tbc["region"]}-fresh/', market_url(tbc))
        snapshot = parse_csv(HEADER + ROW, classic)
        self.assertEqual(validate_snapshot(snapshot, classic), snapshot)
        with self.assertRaises(ValueError):
            validate_snapshot(snapshot, tbc)

    def test_prices_and_quoted_names(self):
        snapshot = parse_csv(HEADER + ROW, MARKETS[0])
        self.assertEqual(snapshot["items"]["21877"], dict(recent=2322, marketValue=1708))
        self.assertEqual(validate_snapshot(snapshot, MARKETS[0]), snapshot)
        self.assertEqual(encode_snapshot(snapshot), encode_snapshot(snapshot))

    def test_zero_and_missing_are_unknown(self):
        snapshot = parse_csv(HEADER + ROW.replace("1708,0,2322", ",0,0"), MARKETS[0])
        self.assertEqual(snapshot["items"]["21877"], dict(recent=None, marketValue=None))

    def test_corruption(self):
        for raw in [HEADER, HEADER + ROW + ROW, HEADER + ROW.replace("2322", "-1"),
                    HEADER + ROW.replace("2322", "1.5"), HEADER + ROW.replace("2322", "9007199254740992"),
                    HEADER + ROW.replace("2026-01-01", "bad"), HEADER + ROW.replace("2026", "2099"),
                    HEADER + ROW + ROW.replace("21877", "21840").replace("01-01", "01-02"),
                    HEADER + '1,"unterminated', HEADER.replace("recent", "other") + ROW]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_csv(raw, MARKETS[0])

if __name__ == "__main__":
    unittest.main()
