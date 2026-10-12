import unittest

from icons import parse_icon


class IconTests(unittest.TestCase):
    def test_checks_echoed_identity_and_normalizes_icon(self):
        payload = {"name": "Test &amp; Item", "icon": "INV_Test", "tooltip": "<!--i?42:1:60:15-->"}
        url, echoed = parse_icon(payload, "Test & Item", 42)
        self.assertTrue(echoed)
        self.assertTrue(url.endswith("inv_test.jpg"))
        payload["icon"] = "inv_chest-_cloth_skybornec60_b_01"
        self.assertTrue(parse_icon(payload, "Test & Item", 42)[0].endswith("inv_chest-_cloth_skybornec60_b_01.jpg"))
        with self.assertRaisesRegex(ValueError, "item-id-mismatch"):
            parse_icon(payload, "Test & Item", 43)

    def test_mismatched_names_and_invalid_icons_do_not_get_urls(self):
        for payload in [{"name": "Other", "icon": "inv_test", "tooltip": "x"},
                        {"name": "Test", "icon": "../bad.jpg", "tooltip": "x"},
                        {"name": "Test", "icon": "inv_test"}]:
            with self.assertRaises(ValueError):
                parse_icon(payload, "Test", 42)

    def test_response_without_id_echo_is_recorded_honestly(self):
        _, echoed = parse_icon({"name": "Test", "icon": "inv_test", "tooltip": "x"}, "Test", 42)
        self.assertFalse(echoed)


if __name__ == "__main__":
    unittest.main()
