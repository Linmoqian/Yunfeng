/* 真实节点的组织隔离回归；验证下行可见、猜测文件 ID、关系调整与重启。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { AgentMember, connectMember, memberTransport } from "../src/index.ts";

test("组织关系仅向下暴露一级，写入响应、报告和文件不泄露祖先，调整与重启保留", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yf-org-"));
  let child: ReturnType<typeof spawn>, lines: ReturnType<typeof createInterface>;
  let address = "", control = "";
  const call = async (input: unknown) => {
    const response = await fetch(address + "/v1/local", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${control}` }, body: JSON.stringify(input), signal: AbortSignal.timeout(5000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error.code);
    return value;
  };
  const start = async () => {
    child = spawn(new URL("../../target/debug/yunfeng-team-node", import.meta.url).pathname, ["--data-dir", directory, "--name", "组织隔离验收"]);
    lines = createInterface({ input: child.stdout! });
    const [line] = await once(lines, "line", { signal: AbortSignal.timeout(10_000) });
    address = JSON.parse(line).address;
    control = await readFile(join(directory, "control.token"), "utf8");
  };
  const stop = async () => {
    await call({ action: "shutdown" });
    if (child.exitCode === null) await once(child, "exit");
    lines.close();
  };
  try {
    await start();
    const admin = await call({ action: "create", name: "上级团队名称不应进入成员快照" });
    const actors = [];
    for (const name of ["根成员", "中层成员", "末级成员", "同级成员"]) {
      const id = crypto.randomUUID();
      await call({ action: "member", member: { id, profile: { name, kind: "agent", access: "editor", summary: "", enabled: true, robotControl: false, assistant: null, robot: null } } });
      const { token } = await call({ action: "grant", id });
      actors.push({ id, token });
    }
    const [root, middle, leaf, sibling] = actors;
    const member = (actor: typeof root) => new AgentMember(actor.id, connectMember(address, actor.token));
    const attach = (id: string, parentId: string | null) => call({ action: "relation", relation: { memberId: id, parentId } });
    await attach(middle.id, root.id); await attach(leaf.id, middle.id); await attach(sibling.id, root.id);
    await member(root).reportStatus("online");
    await member(leaf).reportStatus("working");
    const activity = await member(middle).reportStatus("idle");
    assert.deepEqual(activity.presence.map((p) => [p.memberId, p.status]).sort(), [[middle.id, "idle"], [leaf.id, "working"]].sort());
    await assert.rejects(memberTransport(address, middle.token).call({ action: "presence", status: "working", memberId: root.id }), /COLLAB_INPUT/);
    await assert.rejects(attach(root.id, leaf.id), /COLLAB_INPUT/);
    await assert.rejects(attach(middle.id, middle.id), /COLLAB_INPUT/);
    assert.deepEqual((await member(root).children()).map((m) => m.id).sort(), [middle.id, sibling.id].sort());
    assert.deepEqual((await member(middle).children()).map((m) => m.id), [leaf.id]);
    assert.deepEqual(await member(leaf).children(), []);
    await assert.rejects(memberTransport(address, middle.token).call({ action: "children", id: root.id }), /COLLAB_INPUT/);
    await assert.rejects(memberTransport(address, middle.token).call({ action: "relation", relation: { memberId: middle.id, parentId: null } }), /COLLAB_INPUT/);
    await member(root).sendMessage("根成员的内部记录");
    await member(root).publishAnnouncement("根成员的内部报告");
    const rootShared = await member(root).shareFile("root.txt", new TextEncoder().encode("root-private")) as any;
    const rootFile = rootShared.files[0].id;
    const leafShared = await member(leaf).shareFile("leaf.txt", new TextEncoder().encode("leaf-result")) as any;
    const leafFile = leafShared.files[0].id;
    await member(leaf).publishAnnouncement("末级实验结论");
    await member(leaf).sendMessage("末级实验进展");
    const updated = await member(middle).sendMessage("本层更新返回的也只能是下行快照") as any;
    assert.deepEqual(Object.keys(updated).sort(), ["identity", "children", "messages", "files", "boards", "presence"].sort());
    assert(!JSON.stringify(updated).includes(root.id));
    assert(!JSON.stringify(updated).includes(sibling.id));
    assert(!JSON.stringify(updated).includes("根成员的内部"));
    assert(!JSON.stringify(updated).includes("上级团队名称"));
    assert(!JSON.stringify(updated).includes(admin.node.id));
    assert(!JSON.stringify(await member(middle).identity()).includes("nodeId"));
    assert.equal(updated.boards[0].announcement, "末级实验结论");
    assert.equal(updated.files[0].id, leafFile);
    assert.equal((await member(middle).readFile(leafFile) as any).data, btoa("leaf-result"));
    await assert.rejects(member(middle).readFile(rootFile), /NODE_FORBIDDEN/);
    await assert.rejects(member(root).readFile(leafFile), /NODE_FORBIDDEN/);
    await assert.rejects(member(leaf).readFile(rootFile), /NODE_FORBIDDEN/);
    await attach(leaf.id, sibling.id);
    assert.deepEqual(await member(middle).children(), []);
    await assert.rejects(member(middle).readFile(leafFile), /NODE_FORBIDDEN/);
    assert.equal((await member(sibling).observe()).files[0].id, leafFile);
    await attach(leaf.id, null);
    assert.deepEqual(await member(sibling).children(), []);
    await attach(leaf.id, middle.id);
    await stop(); await start();
    assert((await member(middle).observe()).presence.every((p) => p.status === "unknown"));
    assert.deepEqual((await member(middle).children()).map((m) => m.id), [leaf.id]);
    assert.equal((await member(middle).observe()).boards[0].announcement, "末级实验结论");
    assert(!JSON.stringify(await member(leaf).observe()).includes(root.id));
  } finally {
    if (child! && child.exitCode === null) await stop().catch(() => child.kill());
    if (child!?.exitCode === null) await once(child!, "exit");
    lines!?.close(); await rm(directory, { recursive: true });
  }
});
