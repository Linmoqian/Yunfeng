"""复用本机三节点实例，实测90秒租约与断线恢复；不缩短生产超时。
Created on 2026-10-17
@author: https://github.com/Linmoqian
"""
import json
import sqlite3
import sys
import time


def exercise_presence(nodes, call, sync, stop, start):
    tokens = {label: call(label, {"action": "grant", "id": node["id"]})["token"] for label, node in nodes.items()}

    def report(label, status):
        return call(label, {"action": "presence", "status": status}, token=tokens[label], route="/v1/member")

    def state(label, member):
        values = call(label, {"action": "snapshot"})["snapshot"]["presence"]
        return next(p for p in values if p["memberId"] == nodes[member]["id"])

    def progress(phase):
        print(json.dumps({"presencePhase": phase}, ensure_ascii=False), file=sys.stderr, flush=True)

    def event_count(label):
        with sqlite3.connect(nodes[label]["directory"] / "store.sqlite3") as db:
            return db.execute("SELECT COUNT(*) FROM node_event").fetchone()[0]

    for child, parent in [("B", "A"), ("C", "B")]:
        call(child, {"action": "relation", "relation": {"memberId": nodes[child]["id"], "parentId": nodes[parent]["id"]}})
    sync("C", "B", "A", "B", "C")
    counts = {label: event_count(label) for label in nodes}
    expected = {"A": "online", "B": "working", "C": "idle"}
    for label, status in expected.items():
        report(label, status)
    sync("C", "B", "A", "B", "C")
    for receiver in nodes:
        assert {label: state(receiver, label)["status"] for label in nodes} == expected
    root_view = call("A", {"action": "snapshot"}, token=tokens["A"], route="/v1/member")
    middle_view = call("B", {"action": "snapshot"}, token=tokens["B"], route="/v1/member")
    assert {p["memberId"] for p in root_view["presence"]} == {nodes["A"]["id"], nodes["B"]["id"]}
    assert {p["memberId"] for p in middle_view["presence"]} == {nodes["B"]["id"], nodes["C"]["id"]}
    assert nodes["C"]["id"] not in json.dumps(root_view) and nodes["A"]["id"] not in json.dumps(middle_view)
    for status in ["online", "working", "idle"]:
        report("C", status)
        sync("C", "B", "A")
        assert state("A", "C")["status"] == status
    expiry = state("A", "C")["expiresAt"]
    sync("A", "B", "A", "B")
    assert state("A", "C")["expiresAt"] <= expiry, "重复转发延长了租约"
    assert {label: event_count(label) for label in nodes} == counts, "心跳被写入事件日志"
    progress("三种状态跨两跳同步；重复同步、事件日志与层级隔离通过")

    address = nodes["C"]["address"]
    stop("C")
    start("C", address)
    assert state("C", "C")["status"] == "unknown"
    sync("C", "B", "A")
    assert state("C", "C")["status"] == "unknown", "重启后从邻居恢复了本人旧状态"
    report("C", "working")
    sync("C", "B", "A")
    assert state("A", "C")["status"] == "working", "重启后的新修订未覆盖旧缓存"
    stop("C")
    deadline = time.monotonic() + 91
    progress("停止 C，保持 A/B 心跳与重复同步，实等90秒租约过期")
    while time.monotonic() < deadline:
        report("A", "online")
        report("B", "working")
        failures = call("B", {"action": "sync"})["results"]
        assert any(not item["ok"] and item["node"] == nodes["C"]["id"] for item in failures)
        sync("A")
        time.sleep(min(10, max(0, deadline - time.monotonic())))
    for receiver in ["A", "B"]:
        assert state(receiver, "C")["status"] == "offline", "断线旧心跳被转发续命"
        assert state(receiver, "A")["status"] == "online"
        assert state(receiver, "B")["status"] == "working"
    progress("断线过期通过，恢复 C 并重新上报")
    start("C", address)
    assert state("C", "C")["status"] == "unknown"
    report("C", "online")
    sync("C", "B", "A", "B", "C")
    assert all(state(receiver, "C")["status"] == "online" for receiver in nodes)
    report("C", "idle")
    sync("C", "B", "A")
    assert state("A", "C")["status"] == "idle"
    assert {label: event_count(label) for label in nodes} == counts
    progress("重新上报后在线与空闲恢复通过")
    return {"statuses": ["online", "working", "idle"], "relayHops": 2, "leaseSeconds": 90,
            "duplicatesDoNotRenew": True, "heartbeatEventsAdded": 0, "organizationIsolation": True,
            "restartSelfUnknown": True, "postRestartRevisionAccepted": True,
            "disconnectExpires": True, "reconnected": True}
