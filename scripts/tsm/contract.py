"""Strict public TSM CSV -> deterministic CraftCalc snapshot contract."""
import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

REALMS = json.loads((Path(__file__).resolve().parents[2] / "src/domain/tsm-markets.json").read_text())
MARKETS = [dict(**({"version": "classic"} if realm["version"] == "classic" else {}), region=realm["region"], realm=realm["realm"], faction=faction)
           for realm in REALMS for faction in ("alliance", "horde")]
MAX_SAFE_INTEGER = 9007199254740991

def market_key(market):
    # TBC snapshots published before Classic support have no version field.
    normalized = {key: value for key, value in market.items() if not (key == "version" and value == "tbc")}
    if normalized not in MARKETS:
        raise ValueError("Unsupported TSM market")
    return f'{market.get("version", "tbc")}-{market["region"]}-{market["realm"]}-{market["faction"]}'


def market_url(market):
    market_key(market)
    region = market["region"] + ("-fresh" if market.get("version", "tbc") == "tbc" else "")
    return f'https://public-data.tradeskillmaster.com/classic/{region}/realm/{market["realm"]}-{market["faction"]}/items.csv'

def validate_timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", value):
        raise ValueError("Invalid scan timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed > datetime.now(timezone.utc):
        raise ValueError("Scan timestamp is in the future")
    return value

def price(value):
    if value == "":
        return None
    if not re.fullmatch(r"\d+", value) or int(value) > MAX_SAFE_INTEGER:
        raise ValueError("Invalid copper price")
    # Public CSV uses 0 when a source has no price (e.g. recent=0 with DBMarket>0).
    return int(value) or None

def parse_csv(raw, market):
    market_key(market)
    try:
        reader = iter(list(csv.reader(io.StringIO(raw.lstrip("\ufeff")), strict=True)))
    except csv.Error as error:
        raise ValueError("Malformed TSM CSV") from error
    header = next(reader, None)
    required = ["itemId", "name", "marketValue", "minBuyout", "recent", "historical", "updatedAt"]
    if header != required:
        raise ValueError("Unexpected TSM CSV columns")
    items = {}
    scanned_at = None
    for row in reader:
        if not row:
            continue
        if len(row) != len(header):
            raise ValueError("Invalid CSV row length")
        item_id, _, market_value, min_buyout, recent, historical, updated_at = row
        if not re.fullmatch(r"[1-9]\d*", item_id) or int(item_id) > MAX_SAFE_INTEGER or item_id in items:
            raise ValueError("Invalid or duplicate item ID")
        # Era exports can omit every scan time. Keep it unknown, not the download time.
        updated_at = None if updated_at == "" and market.get("version") == "classic" else validate_timestamp(updated_at)
        if items and updated_at != scanned_at:
            raise ValueError("Mixed scan timestamps")
        scanned_at = updated_at
        price(min_buyout)
        price(historical)
        items[item_id] = dict(recent=price(recent), marketValue=price(market_value))
    if not items:
        raise ValueError("Empty TSM snapshot")
    return dict(schemaVersion=1, market=market, scannedAt=scanned_at, items=items)

def encode_snapshot(snapshot):
    raw = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return raw, hashlib.sha256(raw).hexdigest()

def validate_snapshot(snapshot, market):
    if snapshot.get("schemaVersion") != 1 or snapshot.get("market") != market:
        raise ValueError("Snapshot market/version mismatch")
    if snapshot["scannedAt"] is not None or market.get("version") != "classic":
        validate_timestamp(snapshot["scannedAt"])
    if not isinstance(snapshot["items"], dict) or not snapshot["items"]:
        raise ValueError("Empty snapshot")
    for item_id, values in snapshot["items"].items():
        if not re.fullmatch(r"[1-9]\d*", item_id) or set(values) != {"recent", "marketValue"}:
            raise ValueError("Invalid snapshot item")
        for value in values.values():
            if value is not None and (type(value) is not int or not 0 < value <= MAX_SAFE_INTEGER):
                raise ValueError("Invalid snapshot price")
    return snapshot
