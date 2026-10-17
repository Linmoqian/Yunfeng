#!/usr/bin/env python3
"""三个真实本机进程的闭环验收；凭据仅在私有临时目录与请求头中使用。
Created on 2026-10-17
@author: https://github.com/Linmoqian
"""
import argparse
import base64
import hashlib
import json
import pathlib
import select
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid


def exercise(binary, root, verify_presence=False):
    nodes = {}

    def start(label, address=None):
        directory = root / label
        bind = address.removeprefix("http://") if address else "127.0.0.1:0"
        process = subprocess.Popen([str(binary), "--data-dir", str(directory), "--name", label, "--bind", bind], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        nodes[label] = {"process": process, "directory": directory}
        if not select.select([process.stdout], [], [], 15)[0]:
            raise AssertionError("节点启动超时")
        line = process.stdout.readline()
        if not line:
            raise AssertionError("节点启动失败")
        ready = json.loads(line)
        node = nodes[label]
        node.update(ready)
        node["token"] = (directory / "control.token").read_text()
        return node

    def call(label, command, token=None, route="/v1/local"):
        node = nodes[label]
        request = urllib.request.Request(node["address"] + route, data=json.dumps(command).encode(), headers={"Authorization": "Bearer " + (token if token is not None else node["token"]), "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)

    def stop(label):
        node = nodes[label]
        if node["process"].poll() is None and "address" not in node:
            node["process"].terminate()
            node["process"].wait(timeout=5)
        if node["process"].poll() is None:
            call(label, {"action": "shutdown"})
            node["process"].wait(timeout=5)
        node["process"].stdout.close()
        node["process"].stderr.close()

    # 自动同步诊断是运行时状态，重启后重新测量，不属于持久化事实。
    def durable(state):
        return {k: v for k, v in state.items() if k != "autoSync"}

    def sync(*labels):
        for label in labels:
            result = call(label, {"action": "sync"})
            assert all(row["ok"] for row in result["results"]), "邻居同步失败"

    try:
        for label in ["A", "B", "C"]:
            start(label)
        assert len({n["id"] for n in nodes.values()}) == 3
        call("A", {"action": "create", "name": "本机对等验收团队"})
        call("A", {"action": "create", "name": "本机对等验收团队"})  # 创建请求重试
        invitation = call("A", {"action": "invite"})
        call("B", {"action": "join", "invitation": invitation})
        call("B", {"action": "join", "invitation": invitation})  # 丢失响应后的同节点重试
        call("C", {"action": "join", "invitation": call("B", {"action": "invite"})})
        assert len(call("A", {"action": "snapshot"})["peers"]) == 1
        assert len(call("B", {"action": "snapshot"})["peers"]) == 2
        assert len(call("C", {"action": "snapshot"})["peers"]) == 1
        first = {"action": "message", "id": str(uuid.uuid4()), "text": "A 的原始消息，经 B 转发到 C"}
        call("A", first)
        call("A", first)
        sync("A", "B")
        second = {"action": "message", "id": str(uuid.uuid4()), "text": "C 复核后回复，经 B 返回 A"}
        call("C", second)
        call("C", {"action": "board", "announcement": "C 节点复核公告", "links": []})
        content = pathlib.Path(__file__).read_bytes()  # 真实本地源码文件
        digest = hashlib.sha256(content).hexdigest()
        call("C", {"action": "share", "name": "local_nodes.py", "data": base64.b64encode(content).decode()})
        sync("C", "B", "A", "B", "C")
        for label in nodes:
            state = call(label, {"action": "snapshot"})
            assert {m["id"] for m in state["snapshot"]["messages"]} == {first["id"], second["id"]}
            assert {m["name"] for m in state["snapshot"]["messages"]} == {"A", "C"}
            assert state["snapshot"]["board"] == "C 节点复核公告"
            assert len(state["files"]) == 1
            file = call(label, {"action": "file", "id": state["files"][0]["id"]})
            assert file["sha256"] == digest and base64.b64decode(file["data"]) == content
        for label in ["A", "C"]:
            call(label, {"action": "board", "announcement": label + " 的离线公告更新", "links": []})
        sync("A", "C", "B", "A", "C")
        boards = {call(label, {"action": "snapshot"})["snapshot"]["board"] for label in nodes}
        assert len(boards) == 1, "并发公告未收敛"
        try:
            call("A", {"action": "snapshot"}, token="invalid")
            raise AssertionError("错误凭据被接受")
        except urllib.error.HTTPError as error:
            assert error.code == 403
        try:
            call("A", {"action": "share", "name": "../escape", "data": "eA=="})
            raise AssertionError("路径穿越文件名被接受")
        except urllib.error.HTTPError as error:
            assert error.code == 400
        records = []
        for label, kind in [("A", "human"), ("B", "agent"), ("C", "program"), ("C", "robot")]:
            record = {"id": str(uuid.uuid4()), "profile": {"name": kind + " 成员", "kind": kind, "access": "contributor", "summary": "本机成员同步验收", "enabled": True, "robotControl": False, "assistant": {"model": "test-model", "provider": "local", "skills": ["记录"]} if kind == "agent" else None, "robot": {"kind": "arm", "model": "接口验收", "capabilities": ["joints"]} if kind == "robot" else None}}
            call(label, {"action": "member", "member": record})
            records.append(record)
        sync("A", "C", "B", "A", "C")
        for label in nodes:
            participants = call(label, {"action": "snapshot"})["snapshot"]["participants"]
            assert len(participants) == 7
            assert {m["profile"]["kind"] for m in participants} == {"human", "agent", "program", "robot"}
        try:
            call("A", {"action": "member", "member": records[1]})
            raise AssertionError("节点修改了其他宿主的成员资料")
        except urllib.error.HTTPError as error:
            assert error.code == 403
        actor_token = call("B", {"action": "grant", "id": records[1]["id"]})["token"]
        for label, child_index, parent_index in [("B", 1, 0), ("C", 2, 1), ("C", 3, 0)]:
            call(label, {"action": "relation", "relation": {"memberId": records[child_index]["id"], "parentId": records[parent_index]["id"]}})
        sync("A", "C", "B", "A", "C")
        view = call("B", {"action": "snapshot"}, token=actor_token, route="/v1/member")
        assert [child["id"] for child in view["children"]] == [records[2]["id"]]
        assert records[0]["id"] not in json.dumps(view) and records[3]["id"] not in json.dumps(view)
        try:
            call("A", {"action": "relation", "relation": {"memberId": records[0]["id"], "parentId": records[2]["id"]}})
            raise AssertionError("组织关系形成了环")
        except urllib.error.HTTPError as error:
            assert error.code == 400
        records[1]["profile"]["access"] = "observer"
        call("B", {"action": "member", "member": records[1]})
        sync("B", "A", "C")
        original = {label: call(label, {"action": "snapshot"}) for label in nodes}
        stop("B")
        result = call("A", {"action": "sync"})
        assert len(result["results"]) == 1 and result["results"][0]["ok"] is False
        assert call("A", {"action": "snapshot"})["snapshot"]["messages"] == original["A"]["snapshot"]["messages"]
        start("B", original["B"]["node"]["address"])
        assert durable(call("B", {"action": "snapshot"})) == durable(original["B"])
        identity = call("B", {"action": "identity"}, token=actor_token, route="/v1/member")
        assert identity["id"] == records[1]["id"] and identity["profile"]["access"] == "observer"
        try:
            call("B", {"action": "message", "id": str(uuid.uuid4()), "text": "重启后越权"}, token=actor_token, route="/v1/member")
            raise AssertionError("重启后丢失成员权限")
        except urllib.error.HTTPError as error:
            assert error.code == 403
        restored_view = call("B", {"action": "snapshot"}, token=actor_token, route="/v1/member")
        assert restored_view["children"] == view["children"]
        assert records[0]["id"] not in json.dumps(restored_view)
        sync("B", "A", "C")
        stop("A")
        start("A", original["A"]["node"]["address"])
        assert durable(call("A", {"action": "snapshot"})) == durable(original["A"])
        sync("A", "B", "C")
        presence = {}
        if verify_presence:
            from presence_nodes import exercise_presence
            presence = exercise_presence(nodes, call, sync, stop, start)
        return {"presence": presence, "nodes": 3, "topology": "A—B—C", "directPeerCounts": [1, 2, 1], "messages": 2, "members": 7, "memberKinds": ["human", "agent", "program", "robot"], "memberRightsRetained": True, "organizationIsolation": True, "organizationRestartRetained": True, "foreignMemberEditRejected": True, "fileBytes": len(content), "sha256": digest, "fileBytesEqual": True, "boardConverged": True, "restartRetained": True, "offlineRecovered": True, "invalidTokenRejected": True, "unsafeFileNameRejected": True, "scope": "loopback-only"}
    finally:
        for label, node in nodes.items():
            try:
                stop(label)
            except (OSError, subprocess.TimeoutExpired):
                node["process"].terminate()
                node["process"].wait(timeout=5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / "target/debug/yunfeng-team-node")
    parser.add_argument("--report", type=pathlib.Path)
    parser.add_argument("--presence", action="store_true", help="额外实等90秒验证状态租约与断线恢复")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="yunfeng-team-nodes-") as directory:
        report = exercise(args.binary.resolve(), pathlib.Path(directory), args.presence)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
