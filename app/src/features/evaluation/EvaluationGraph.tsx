/* 任务、候选 Agent 与重复实验关系图；复用科研节点和轻量胶囊。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { useMemo } from "react";
import { ReactFlow, Handle, Position, NodeToolbar, Controls, useViewport, type Node, type NodeProps } from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BranchNode, Capsule, motionPresets } from "../../components/common";
import { duration, summarize } from "./report";
import type { EvaluationRun } from "./types";
import { useGraphSize, useGraphViewport } from "./useGraphViewport";
import styles from "./Evaluation.module.css";
import "@xyflow/react/dist/style.css";

type ComparisonNode = Node<{ title: string; summary: string; kind?: string; pills: string[]; expanded: boolean; select: () => void }, "comparison">;
function ComparisonNodeView({ data }: NodeProps<ComparisonNode>) {
  const reduced = useReducedMotion();
  const { zoom } = useViewport();
  const scale = Math.min(1, zoom);
  return <BranchNode title={data.title} summary={data.summary} kind={data.kind} expanded={data.expanded} onClick={data.select}>
    <Handle type="target" position={Position.Top} /><Handle type="source" position={Position.Bottom} />
    <NodeToolbar isVisible position={Position.Bottom} offset={10 * scale}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top center", width: 220 }}><AnimatePresence>{data.expanded && <motion.div className={styles.pills} initial={reduced ? false : { opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={reduced ? { duration: 0 } : motionPresets.enter}>
        {data.pills.map((pill) => <Capsule key={pill} animateOnMount={false}>{pill}</Capsule>)}
      </motion.div>}</AnimatePresence></div>
    </NodeToolbar>
  </BranchNode>;
}
const nodeTypes = { comparison: ComparisonNodeView };
const noAction = () => {};

export function EvaluationGraph({ runs, selected, onSelect }: { runs: EvaluationRun[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const size = useGraphSize();
  const compact = size.width < 760;
  const graph = useMemo(() => {
    const ids = [...new Set(runs.map((run) => run.candidate))];
    const nodes: ComparisonNode[] = [], edges: { id: string; source: string; target: string; type: string }[] = [];
    const add = (id: string, title: string, summary: string, x: number, y: number, pills: string[], kind?: string) => nodes.push({ id, type: "comparison", position: { x, y }, data: { title, summary, pills, kind, expanded: selected === id, select: () => onSelect(selected === id ? null : id) } });
    add("task", runs[0]?.task.title ?? runs[0]?.task.task_id ?? "评估任务", runs[0]?.task.instruction ?? "", (ids.length - 1) * 155, 0, [runs[0]?.task.category ?? "", `${runs.length} 次运行`], "mission");
    ids.forEach((id, index) => {
      const samples = runs.filter((run) => run.candidate === id), summary = summarize(samples);
      const x = index * 310, nodeId = `candidate:${id}`;
      add(nodeId, samples[0].label, `${summary.passed}/${summary.total} 通过 · 中位 ${duration(summary.durationMs)}`, x, 210, [`${summary.tools} 次工具`, `${summary.models} 次模型`, `${summary.tokens} tokens`]);
      edges.push({ id: `root:${id}`, source: "task", target: nodeId, type: "smoothstep" });
      const inspected = samples.find((sample) => sample.id === selected);
      const start = Math.max(0, samples.findIndex((sample) => sample.id === inspected?.id) - 1);
      const visible = compact ? [inspected ?? samples[0]] : samples.slice(start, start + 3);
      if (selected === nodeId || inspected) visible.forEach((sample, repeat) => {
        const verdict = { passed: "验收通过", failed: "未通过", ungraded: "未评分" }[sample.verdict.status];
        add(sample.id, `第 ${sample.repeat} 轮 · ${verdict}`, sample.error ?? sample.verdict.reason, x + (repeat - (visible.length - 1) / 2) * 260, 430, [duration(sample.durationMs), `${sample.toolCalls.length} 次工具`]);
        edges.push({ id: sample.id, source: nodeId, target: sample.id, type: "smoothstep" });
      });
    });
    const widest = compact ? 1 : Math.min(3, Math.max(...ids.map((id) => runs.filter((run) => run.candidate === id).length)));
    return { nodes, edges, bounds: { x: -(widest - 1) * 130 - 30, y: -25, width: (ids.length - 1) * 310 + (widest - 1) * 260 + 280, height: 630 } };
  }, [runs, selected, onSelect, compact]);
  const flow = useGraphViewport(size.width, size.height, graph.bounds);
  return <div ref={size.root} className={styles.canvas} aria-label="Agent 能力比较关系图">
    <ReactFlow<ComparisonNode> nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onInit={(instance) => { flow.current = instance; if (size.width > 0) void instance.fitBounds(graph.bounds, { padding: 0.03 }); }}
      minZoom={0.25} maxZoom={1.4} nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} elementsSelectable={false} edgesFocusable={false}
      onNodeClick={noAction} onPaneClick={() => onSelect(null)} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}>
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  </div>;
}
