/* 报告边界、同条件比较与默认折叠的核心回归；示例来自 agent-eval 的实际替身运行。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import raw from "../src/features/evaluation/fixtures/comparison.json";
import { comparisonGroups, parseEvaluationReport, summarize } from "../src/features/evaluation/report";
import { EvaluationDetails } from "../src/features/evaluation/EvaluationDetails";
import { EvaluationPanel } from "../src/features/evaluation/EvaluationPanel";
vi.mock("../src/features/evaluation/EvaluationGraph", () => ({ EvaluationGraph: ({ onSelect }: { onSelect: (id: string) => void }) => <button onClick={() => onSelect("candidate:tool-loop")}>工具循环分支</button> }));
vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);

test("来自评估核心的报告分组与聚合，不掩盖失败或未评分", () => {
  const report = parseEvaluationReport(raw);
  expect(comparisonGroups(report)).toHaveLength(1);
  const counts = summarize(report.runs);
  expect(counts.total).toBe(6); expect(counts.passed).toBe(3); expect(counts.tools).toBe(3);
  const changed = structuredClone(report);
  changed.runs[0].verdict.status = "ungraded";
  expect(summarize(changed.runs).ungraded).toBe(1);
  changed.runs[0].condition = "different-model-condition";
  changed.runs[0].model = "other";
  expect(comparisonGroups(changed)).toHaveLength(2);
});
test("非法指标、重复样本和不兼容报告均拒绝", () => {
  expect(() => parseEvaluationReport({ schemaVersion: 2 })).toThrow();
  const bad = structuredClone(raw);
  bad.runs[0].durationMs = -1;
  expect(() => parseEvaluationReport(bad)).toThrow();
  const duplicate = structuredClone(raw); duplicate.runs.push(duplicate.runs[0]);
  expect(() => parseEvaluationReport(duplicate)).toThrow();
  const broken = structuredClone(raw); broken.runs[0].toolCalls = [{ name: "read", durationMs: 1, status: "wrong" }];
  expect(() => parseEvaluationReport(broken)).toThrow();
});
test("轮次保留独立验收，费用未知不填零，原始过程默认折叠", async () => {
  const report = parseEvaluationReport(raw);
  const onSelect = vi.fn();
  render(<EvaluationDetails runs={report.runs} selected="candidate:tool-loop" onSelect={onSelect} />);
  expect(screen.getByText("3/3 通过")).toBeTruthy();
  expect(screen.getByText("未提供")).toBeTruthy();
  expect(screen.queryByText("read_record")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "查看执行轨迹与最终答案" }));
  expect(screen.getByRole("heading", { name: "最终答案" })).toBeTruthy();
  expect(screen.getByText("42")).toBeTruthy();
});
test("工作台载入示例后清楚标记替身，点击分支查看结果", async () => {
  render(<EvaluationPanel />);
  await userEvent.click(screen.getByRole("button", { name: "载入示例" }));
  expect(await screen.findByText("固定模型替身 · 示例")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "工具循环分支" }));
  expect(screen.getByRole("complementary", { name: "评估结果详情" })).toBeTruthy();
  expect(screen.getByText("3/3 通过")).toBeTruthy();
});
