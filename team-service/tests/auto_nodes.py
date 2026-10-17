#!/usr/bin/env python3
"""真实 A—B—C 自动同步验收；全程禁止发送 sync，不依赖桌面计时器。
Created on 2026-10-17
@author: https://github.com/Linmoqian
"""
import argparse
import json
import pathlib
import select
import subprocess
import tempfile
import time
import urllib.request
import uuid


def exercise(binary, root):
    nodes = {}
    maximum_read = 0

    def start(label, address=None):
        directory = root / label
        process = subprocess.Popen([str(binary), "--data-dir", str(directory), "--name", label,
                                    "--bind", address.removeprefix("http://") if address else "127.0.0.1:0"],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        nodes[label] = {"process": process, "directory": directory}
        assert select.select([process.stdout], [], [], 15)[0], "节点启动超时"
        line = process.stdout.readline()
        assert line, "节点启动失败"
        nodes[label].update(json.loads(line))
        nodes[label]["token"] = (directory / "control.token").read_text()

    def call(label, action="snapshot", **fields):
        nonlocal maximum_read
        assert action != "sync", "本验收禁止显式同步"
        node = nodes[label]
        request = urllib.request.Request(node["address"] + "/v1/local",
            data=json.dumps({"action": action, **fields}).encode(),
            headers={"Authorization": "Bearer " + node["token"], "Content-Type": "application/json"})
        before = time.monotonic()
        with urllib.request.urlopen(request, timeout=8) as response:
            value = json.load(response)
        if action == "snapshot":
            maximum_read = max(maximum_read, time.monotonic() - before)
        return value

    def stop(label):
        node = nodes[label]
        process = node["process"]
        if process.poll() is None:
            call(label, "shutdown")
            process.wait(timeout=7)
        process.stdout.close()
        process.stderr.close()

    def wait(check, message, timeout=20):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if check():
                return
            time.sleep(0.2)
        raise AssertionError(message)

    def status(receiver, member):
        values = call(receiver)["snapshot"]["presence"]
        return next((p["status"] for p in values if p["memberId"] == nodes[member]["id"]), "unknown")

    def relation(receiver, parent):
        return {"memberId": nodes["C"]["id"], "parentId": nodes[parent]["id"]} in call(receiver)["snapshot"]["relations"]

    try:
        for label in ["A", "B", "C"]:
            start(label)
        call("A", "create", name="自动多跳验收")
        call("B", "join", invitation=call("A", "invite"))
        call("C", "join", invitation=call("B", "invite"))
        wait(lambda: len(call("A")["snapshot"]["participants"]) == 3, "成员未自动到达 A")
        assert [len(call(n)["peers"]) for n in nodes] == [1, 2, 1]
        call("C", "relation", relation={"memberId": nodes["C"]["id"], "parentId": nodes["A"]["id"]})
        wait(lambda: relation("A", "A"), "关系未跨两跳更新")
        for state in ["online", "working", "idle"]:
            call("C", "presence", status=state)
            wait(lambda: status("A", "C") == state, "状态未跨两跳更新: " + state)
        # 双向同时产生事实，自动交换不能互相阻塞，重复交换不能重复插入。
        ids = []
        for label in ["A", "C"]:
            identity = str(uuid.uuid4())
            ids.append(identity)
            call(label, "message", id=identity, text=label + " 自动消息")
        wait(lambda: all({m["id"] for m in call(n)["snapshot"]["messages"]} == set(ids) for n in nodes), "消息未收敛")
        before = next(p["expiresAt"] for p in call("A")["snapshot"]["presence"] if p["memberId"] == nodes["C"]["id"])
        # 中继断线，C 在隔离侧产生新关系/公告，A 保留已知图和消息。
        middle_address = nodes["B"]["address"]
        stop("B")
        call("C", "relation", relation={"memberId": nodes["C"]["id"], "parentId": nodes["B"]["id"]})
        call("C", "board", announcement="隔离侧公告", links=[])
        print("中继已停止，实等生产90秒租约；全程没有 sync 请求", flush=True)
        deadline = time.monotonic() + 91
        while time.monotonic() < deadline:
            call("C", "presence", status="working")
            call("A", "presence", status="online")
            assert relation("A", "A"), "断线清空了关系"
            time.sleep(min(10, max(0, deadline - time.monotonic())))
        assert status("A", "C") == "offline", "断线旧心跳被自动转发续命"
        assert call("A")["autoSync"]["failedPeers"] == 1
        start("B", middle_address)
        call("C", "presence", status="working")
        wait(lambda: status("A", "C") == "working" and relation("A", "B")
             and call("A")["snapshot"]["board"] == "隔离侧公告", "中继恢复后没有自动收敛", timeout=40)
        wait(lambda: all(call(n)["autoSync"]["failedPeers"] == 0 for n in nodes), "重试状态未复位", timeout=25)
        assert len(call("A")["snapshot"]["messages"]) == 2
        # 入口重启，不重新配对，邻居与新事实仍能自动恢复。
        address = nodes["A"]["address"]
        stop("A")
        start("A", address)
        call("C", "presence", status="idle")
        wait(lambda: status("A", "C") == "idle" and relation("A", "B"), "入口重启后未自动恢复", timeout=40)
        assert maximum_read < 1.5, "自动交换阻塞了本地读取"
        return {"nodes": 3, "topology": "A—B—C", "explicitSyncRequests": 0,
                "statuses": ["online", "working", "idle", "offline"], "leaseSeconds": 90,
                "relayRestartRecovered": True, "entryRestartRecovered": True,
                "relationsRecovered": True, "partitionBoardMerged": True,
                "messagesDeduplicated": True, "initialExpiry": before,
                "maximumSnapshotSeconds": round(maximum_read, 3)}
    finally:
        for label, node in nodes.items():
            try:
                stop(label)
            except Exception:
                if node["process"].poll() is None:
                    node["process"].terminate()
                    node["process"].wait(timeout=5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / "target/debug/yunfeng-team-node")
    parser.add_argument("--report", type=pathlib.Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="yunfeng-auto-nodes-") as directory:
        report = exercise(args.binary.resolve(), pathlib.Path(directory))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
