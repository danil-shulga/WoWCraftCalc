"""Version-isolated Wowhead icon cache with two workers and bounded retries."""

import argparse
import concurrent.futures
import html
import json
import pathlib
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.request

from sources import USER_AGENT, WORK, save_json
from build import prettier

ICON_BASE = "https://wow.zamimg.com/images/wow/icons/large/"


def normalized_name(value):
    return " ".join(unicodedata.normalize("NFKC", html.unescape(value)).split())


def parse_icon(payload, expected_name, item_id):
    if not isinstance(payload, dict) or not isinstance(payload.get("tooltip"), str):
        raise ValueError("invalid-tooltip")
    name = payload.get("name")
    if not isinstance(name, str) or not expected_name or normalized_name(name) != normalized_name(expected_name):
        raise ValueError("name-mismatch")
    icon = payload.get("icon")
    if not isinstance(icon, str) or not re.fullmatch(r"[a-zA-Z0-9_-]+", icon):
        raise ValueError("invalid-icon-name")
    echoed_ids = [int(i) for i in re.findall(r"<!--i\?(\d+):", payload["tooltip"])]
    if echoed_ids and set(echoed_ids) != {item_id}:
        raise ValueError("item-id-mismatch")
    if "id" in payload and payload["id"] != item_id:
        raise ValueError("item-id-mismatch")
    return ICON_BASE + icon.lower() + ".jpg", bool(echoed_ids or "id" in payload)


def collect(database_path, limit=None):
    db = json.loads(database_path.read_text(encoding="utf-8"))
    version = db["gameVersion"]
    cache_path = WORK / "cache" / version / "icons.json"
    cache = {"gameVersion": version, "items": {}}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        if cache["gameVersion"] != version:
            raise ValueError("Wrong cache version")
    pending = [i for i in db["items"].values() if str(i["itemId"]) not in cache["items"]
               or cache["items"][str(i["itemId"])].get("expectedName") != i["names"]["en"]]
    if limit is not None:
        pending = pending[:limit]
    stopped = threading.Event()

    def lookup(item):
        if stopped.is_set():
            return None
        item_id = item["itemId"]
        url = f"https://nether.wowhead.com/{version}/tooltip/item/{item_id}"
        entry = {"itemId": item_id, "expectedName": item["names"]["en"], "url": url,
                 "iconUrl": "", "snapshotDate": db["snapshotDate"]}
        for attempt in range(3):
            if stopped.is_set():
                return None
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=20) as response:
                    entry["httpStatus"] = response.status
                    entry["responseUrl"] = response.url
                    if response.url != url:
                        raise ValueError("unexpected-redirect")
                    if "application/json" not in response.headers.get("Content-Type", ""):
                        raise ValueError("invalid-content-type")
                    payload = json.load(response)
                    entry["responseName"] = payload.get("name")
                    entry["iconUrl"], entry["itemIdEchoed"] = parse_icon(payload, item["names"]["en"], item_id)
                    entry["status"] = "ok"
                    entry["identityCheck"] = "unchanged version/item URL and exact English name; itemId checked when echoed"
                    break
            except urllib.error.HTTPError as error:
                entry.update(httpStatus=error.code, status=f"http-{error.code}")
                if error.code in [403, 429]:
                    entry["retryAfter"] = error.headers.get("Retry-After")
                    stopped.set()
                    break
                if error.code < 500 or attempt == 2:
                    break
                time.sleep(2 ** attempt)
            except (urllib.error.URLError, TimeoutError) as error:
                entry["status"] = "network-error"
                entry["error"] = str(error)
                if attempt == 2:
                    break
                time.sleep(2 ** attempt)
            except (ValueError, json.JSONDecodeError) as error:
                entry["status"] = str(error)
                break
        time.sleep(0.2)
        return entry

    print(f"{version}: {len(pending)} pending, {len(cache['items'])} cached", flush=True)
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for count, entry in enumerate(pool.map(lookup, pending), 1):
                if entry is None:
                    continue
                cache["items"][str(entry["itemId"])] = entry
                if count % 25 == 0 or entry["status"] != "ok":
                    save_json(cache_path, cache)
                if count % 100 == 0 or entry["status"] != "ok":
                    print(f"{version}: {count}/{len(pending)}, latest status {entry['status']}", flush=True)
    finally:
        save_json(cache_path, cache)
    if stopped.is_set():
        raise RuntimeError("403/429: requests stopped; inspect cache before retrying")
    counts = {}
    for value in cache["items"].values():
        counts[value["status"]] = counts.get(value["status"], 0) + 1
    report = {"gameVersion": version, "build": db["build"], "endpoint": db["iconSource"]["endpoint"],
              "workers": 2, "pauseSecondsPerWorker": 0.2, "timeoutSeconds": 20, "maximumAttempts": 3,
              "statistics": counts, "failures": [v for v in cache["items"].values() if v["status"] != "ok"],
              "responseIdentityLimitation": "Many tooltip responses do not echo an item ID. Those are checked by unchanged endpoint URL and exact English name, not by an independent echoed ID."}
    report_path = WORK / "reports" / f"icons.{version}.{db['build']}.json"
    save_json(report_path, report)
    prettier(report_path)
    print(version, counts, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=pathlib.Path)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    collect(args.database, args.limit)
