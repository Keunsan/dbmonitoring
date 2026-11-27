"""P0-A 다수 인스턴스 게이트 스모크 (민감 정보 출력 없음)."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime

BASE = os.environ.get("GATE_API_BASE", "http://127.0.0.1:8000/api/v1")
MARK = datetime.now(UTC).strftime("%Y%m%d%H%M%S")

# backend 루트에서 .env.local 로드 (get_settings)
if __package__ is None:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from src.config.loader import get_settings

    settings = get_settings()
    os.environ.setdefault("MSSQL_HOST", settings.mssql_host)
    os.environ.setdefault("MSSQL_PORT", str(settings.mssql_port))
    os.environ.setdefault("MSSQL_DATABASE", settings.mssql_database)


def api(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    url = f"{BASE}{path}"
    data = None
    headers = {"Content-Type": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"error": {"message": raw[:200]}}
        return exc.code, parsed


def main() -> int:
    host = os.environ.get("MSSQL_HOST", "").strip()
    database = os.environ.get("MSSQL_DATABASE", "").strip()
    if not host or not database:
        print("SKIP: MSSQL_HOST/MSSQL_DATABASE not set")
        return 2

    report: dict[str, object] = {"ts": MARK, "steps": []}

    def step(name: str, ok: bool, detail: object) -> None:
        report["steps"].append({"name": name, "ok": ok, "detail": detail})

    code, bs_list = api("GET", "/business-systems")
    systems = bs_list.get("data", []) if code == 200 else []
    bs_ids: list[str] = []

    if code == 200 and len(systems) >= 2:
        bs_ids = [systems[0]["id"], systems[1]["id"]]
        step("business_systems", True, {"reused": bs_ids})
    else:
        specs = [
            {"code": f"EG{MARK[-6:]}", "name": f"ERP 게이트 {MARK}", "importance": "HIGH"},
            {"code": f"GG{MARK[-6:]}", "name": f"GW 게이트 {MARK}", "importance": "MEDIUM"},
        ]
        for spec in specs:
            code, res = api("POST", "/business-systems", spec)
            if code == 201:
                bs_ids.append(res["data"]["id"])
            else:
                step(f"create_bs_{spec['code']}", False, res.get("error"))
        step("business_systems", len(bs_ids) >= 2, {"count": len(bs_ids)})

    inst_ids: list[str] = []
    if code == 200:
        code2, list_res = api("GET", "/db-instances")
        items = (list_res.get("data") or {}).get("items") or []
        seen_bs: set[str] = set()
        for it in items:
            if not it.get("isActive"):
                continue
            bs = it.get("businessSystemId")
            if bs in seen_bs:
                continue
            seen_bs.add(bs)
            inst_ids.append(it["id"])
            if len(inst_ids) >= 2:
                break
    if len(inst_ids) >= 2:
        step("db_instances", True, {"reused": inst_ids})
    inst_payloads = [
        {
            "dbmsType": "MSSQL",
            "instanceName": f"erp-gate-{MARK}",
            "host": host,
            "port": int(os.environ.get("MSSQL_PORT", "1433")),
            "databaseName": database,
            "businessSystemId": bs_ids[0],
            "importance": "HIGH",
            "envType": "PROD",
            "collectorType": "AGENTLESS",
            "collectIntervalSec": 60,
            "sqlAggregateIntervalSec": 120,
            "isActive": True,
        },
        {
            "dbmsType": "MSSQL",
            "instanceName": f"gw-gate-{MARK}",
            "host": host,
            "port": int(os.environ.get("MSSQL_PORT", "1433")),
            "databaseName": "master",
            "businessSystemId": bs_ids[1],
            "importance": "MEDIUM",
            "envType": "PROD",
            "collectorType": "AGENTLESS",
            "collectIntervalSec": 60,
            "sqlAggregateIntervalSec": 120,
            "isActive": True,
        },
    ]
    if len(inst_ids) < 2:
        for payload in inst_payloads:
            code, res = api("POST", "/db-instances", payload)
            if code == 201:
                inst_ids.append(res["data"]["id"])
            else:
                step("create_instance", False, res.get("error"))
        step("db_instances", len(inst_ids) >= 2, {"ids": inst_ids})

    for iid in inst_ids:
        code, res = api("POST", f"/db-instances/{iid}/test-connection", {})
        ok = code == 200 and res.get("data", {}).get("ok") is True
        step(f"test_connection_{iid[:8]}", ok, {"code": code, "message": (res.get("data") or {}).get("message")})

    code, list_res = api("GET", "/db-instances")
    items = (list_res.get("data") or {}).get("items") or []
    bss = (list_res.get("data") or {}).get("businessSystems") or []
    mapped = all(any(b.get("id") == it.get("businessSystemId") for b in bss) for it in items if it.get("id") in inst_ids)
    step("list_mapping", code == 200 and mapped, {"items": len(items), "bss": len(bss)})

    for iid in inst_ids:
        code, run = api("POST", "/collector/run", {"dbInstanceId": iid})
        items = (run.get("data") or {}).get("items") or []
        status = items[0].get("status") if items else None
        step(f"collector_single_{iid[:8]}", code == 200 and status == "SUCCESS", {"code": code, "status": status})

    code, run_all = api("POST", "/collector/run", {})
    all_items = (run_all.get("data") or {}).get("items") or []
    success_count = sum(1 for it in all_items if it.get("status") == "SUCCESS")
    step(
        "collector_all",
        code == 200 and success_count >= 2,
        {"code": code, "activeRuns": len(all_items), "success": success_count},
    )

    code, status_res = api("GET", "/collector/status")
    status_items = (status_res.get("data") or {}).get("items") or []
    step("collector_status", code == 200 and len(status_items) >= 2, {"items": len(status_items)})

    code, summary = api("GET", "/monitoring/summary")
    sum_items = (summary.get("data") or {}).get("items") or []
    steps = report["steps"]
    assert isinstance(steps, list)
    gate_ok = len(inst_ids) >= 2 and len(sum_items) >= 2 and all(s.get("ok") for s in steps)
    report["gate"] = {
        "registered_instances": len(inst_ids),
        "summary_items": len(sum_items),
        "passed": gate_ok,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["gate"]["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())