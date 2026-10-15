/* 科研消息过滤与需要人工处理的状态保留。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { researchConversation, researchProgress } from "../src/features/workbench/researchPresentation.ts";
import type { ConversationItem } from "../src/features/workbench/conversationState.ts";
import type { TaskState } from "../src/services/taskService.ts";

test("科研历史与实时过程消息均过滤，保留用户输入和结论，开发会话不受影响", () => {
  const items: ConversationItem[] = [
    { id: "user", role: "user", text: "计划：请对比两种参数" },
    { id: "legacy", role: "assistant", text: "计划：Hook 唤醒，读取 config.json" },
    { id: "decision", role: "assistant", text: "决策：评分 0.7" },
    { id: "raw", role: "assistant", text: "实验结果：succeeded\n{\"pid\":42}" },
    { id: "tool", role: "tool", text: "运行 node" },
    { id: "answer", role: "assistant", text: "反思：压缩体积减少 14.39%，解压一致。" },
  ];
  assert.deepEqual(researchConversation(items, "research").map((item) => item.id), ["user", "answer"]);
  assert.equal(researchConversation(items, "development"), items);
});

test("历史反思移除自动追问并合并重复，用户新指令后的结论仍保留", () => {
  const result = researchConversation([
    { id: "1", role: "assistant", text: "反思：准确率 0.934，独立验证尚未完成。\n\n下一问题：是否继续？", thinking: "内部推理" },
    { id: "2", role: "tool", text: "运行详情" },
    { id: "3", role: "assistant", text: "实验结论：准确率 0.934，独立验证尚未完成。" },
    { id: "4", role: "assistant", text: "反思：目标完成：重复实验步骤\n\n下一问题：扩大目标？" },
    { id: "5", role: "user", text: "下一问题：保持原样" },
    { id: "6", role: "assistant", text: "需要处理：请确认独立验证数据。" },
  ], "research");
  assert.deepEqual(result.map(({ id }) => id), ["1", "5", "6"]);
  assert.equal(result[0].text, "实验结论：准确率 0.934，独立验证尚未完成。");
  assert.equal(result[0].thinking, undefined);
  assert.equal(result[1].text, "下一问题：保持原样");
});

test("正常状态隐藏内部依据，错误与人工问题不被过滤", () => {
  const state: NonNullable<TaskState["autonomy"]> = { phase: "WAITING", goal: "实验", reason: "Hook，原始 JSON 与本地路径", cycle: 1, maxCycles: 20 };
  assert.ok(!researchProgress(state).includes(state.reason));
  assert.equal(researchProgress({ ...state, phase: "FAILED", reason: "HTTP 401：认证失败" }), "HTTP 401：认证失败");
  assert.equal(researchProgress({ ...state, phase: "PAUSED", reason: "请工程师明确验收指标" }), "请工程师明确验收指标");
});
