/* 目标树与决策提案契约；估计收益和成本不属于实测事实。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import type { Condition, Result } from "../types.js";
export interface TaskNode {
  id: string;
  parent: string;
  objective: string;
  kind: "group" | "explore" | "execute";
  priority: number;
  confidence: number;
  cost: number;
  expected_gain: number;
  status: "pending" | "running" | "succeeded" | "failed" | "blocked";
  attempts: number;
  fingerprint?: string;
  jobId?: string;
  result?: Result;
}
export interface DecisionState {
  mission: { id: "mission"; objective: string; condition?: Condition };
  nodes: TaskNode[];
  horizon: string[];
  selectedId?: string;
  budget: { limit: number; spent: number };
  reason: string;
}
export interface Candidate {
  key: string;
  parent: string;
  objective: string;
  kind: TaskNode["kind"];
  confidence: number;
  cost: number;
  expected_gain: number;
}
export interface DecisionProposal {
  decision: "select" | "wait" | "ask" | "stop" | "complete";
  reason: string;
  candidates: Candidate[];
  mission_condition?: Condition;
  observe_paths: string[];
}
