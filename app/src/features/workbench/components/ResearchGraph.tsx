/* 科研中央关系图：读取 Runtime 快照，保留缩放位置并按需查看节点。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useMemo, useRef, useState } from "react";
import { useResearchGraphComponent } from "../hooks/useResearchGraphComponent";
import { ResearchReport } from "./ResearchReport";
import { Capsule } from "./Capsule";
import { Collapse } from "antd";
import { Button } from "antd";
import { MessageSquare, Scan, X, ZoomIn, ZoomOut } from "lucide-react";
import { ReactFlow, Handle, Position, MarkerType, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TaskState } from "../../../services/taskService";
import { layoutResearchGraph, researchNodeStatus, type ResearchGraphItem } from "../researchGraph";
import styles from "./ResearchGraph.module.css";

type GraphNode = Node<ResearchGraphItem & { agent?: boolean; onInspect: (id: string) => void }, "research">;
function ResearchNode({ data }: NodeProps<GraphNode>) {
  return <div className={styles.node} data-status={data.status} data-current={data.current} data-agent={data.agent} data-kind={data.kind}>
    <Handle id="in-left" type="target" position={Position.Left} /><Handle id="in-right" type="target" position={Position.Right} />
    <button type="button" className={`${styles.nodeButton} nodrag nopan`} onClick={() => data.onInspect(data.id)} aria-label={`${data.objective} · ${data.kind === "mission" ? "研究目标" : data.kind === "group" ? "分组" : researchNodeStatus[data.status]}`}>
      <span className={styles.nodeLabel}>{data.objective}</span>
      <span className={styles.nodeMeta}>{data.kind === "mission" ? "研究目标" : data.kind === "group" ? "目标分组" : researchNodeStatus[data.status]}{data.current ? " · 当前节点" : ""}</span>
    </button>
    <Handle id="out-left" type="source" position={Position.Left} /><Handle id="out-right" type="source" position={Position.Right} />
  </div>;
}
const nodeTypes = { research: ResearchNode };
const options = { hideAttribution: true };
export function ResearchGraph({ task, onClose }: { task: TaskState; onClose: () => void }) {
  const decision = task.autonomy?.decision;
  const [inspected, setInspected] = useState<string | null>(null);
  const flow = useRef<ReactFlowInstance<GraphNode>>(null);
  const graph = useMemo(() => decision ? layoutResearchGraph(decision) : null, [decision]);
  const edges = useMemo(() => graph?.items.filter((item) => item.parent).map((item) => ({ id: `edge-${item.id}`, source: item.parent!, target: item.id,
    sourceHandle: item.side > 0 ? "out-right" : "out-left", targetHandle: item.side > 0 ? "in-left" : "in-right", type: "smoothstep",
    style: { stroke: item.current ? "var(--yf-brand-primary)" : "var(--yf-border-default)" }, markerEnd: { type: MarkerType.ArrowClosed } })) ?? [], [graph]);
  const control = useResearchGraphComponent(task.id, task.lastEventSeq, async (id) => {
    const item = graph?.items.find((node) => node.id === id);
    if (!item || !flow.current) throw new Error("节点尚未呈现");
    setInspected(id);
    if (!await flow.current.setCenter(item.position.x + 110, item.position.y + 40, { zoom: flow.current.getZoom() })) throw new Error("画布尚未就绪");
  });
  const nodes = useMemo(() => graph?.items.map((item): GraphNode => ({ id: item.id, type: "research", position: item.position, data: { ...item, onInspect: setInspected, agent: control.agentTarget === item.id } })) ?? [], [graph, control.agentTarget]);
  const selected = graph?.items.find((item) => item.id === inspected);
  const detail = decision?.nodes.find((node) => node.id === inspected);
  return <section ref={control.root} className={styles.graph} aria-label="科研分支关系图" onKeyDown={(event) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
    if (inspected) setInspected(null); else onClose();
  }}>
    <header className={styles.toolbar}><span>研究分支<span className={styles.count}>{decision?.nodes.length ?? 0} 个节点</span></span>{(control.agentTarget || control.yielded) && <Capsule value={control.agentTarget ?? "yielded"}>{control.yielded ? "已让出控制" : "云枫聚焦"}</Capsule>}<div>
      <Button type="text" size="small" title="适应画布" aria-label="适应画布" icon={<Scan size={15} />} onClick={() => void flow.current?.fitView({ padding: 0.2, maxZoom: 1 })} />
      <Button type="text" size="small" title="放大关系图" aria-label="放大关系图" icon={<ZoomIn size={15} />} onClick={() => void flow.current?.zoomIn()} />
      <Button type="text" size="small" title="缩小关系图" aria-label="缩小关系图" icon={<ZoomOut size={15} />} onClick={() => void flow.current?.zoomOut()} />
      <Button type="text" size="small" title="返回对话" aria-label="返回对话" icon={<MessageSquare size={15} />} onClick={onClose} />
    </div></header>
    <div className={styles.canvas}>
      {graph ? <ReactFlow<GraphNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onMoveStart={(event) => { if (event) control.yieldControl(); }}
        onNodeClick={(_, node) => setInspected(node.id)}
        onInit={(instance) => { flow.current = instance; void instance.setCenter(110, 40, { zoom: 0.85 }); }} nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
        elementsSelectable={false} zoomOnDoubleClick={false} minZoom={0.15} maxZoom={1.5} proOptions={options} />
        : <div className={styles.empty}>目标树尚未生成，Agent 规划后会自动呈现。</div>}
      {Boolean(graph?.disconnected) && <p className={styles.warning}>部分节点缺少有效父关系，暂未连线。</p>}
      {selected && <aside className={styles.detail} aria-label="节点详情">
        <Button className={styles.close} type="text" size="small" aria-label="关闭节点详情" icon={<X size={14} />} onClick={() => setInspected(null)} />
        <span className={styles.nodeMeta}>{selected.kind === "mission" ? "研究目标" : selected.kind === "group" ? "目标分组" : researchNodeStatus[selected.status]}</span>
        <p className={styles.objective} title={selected.objective}>{selected.objective}</p>
        {detail && detail.kind !== "group" && <>
          {detail.report && detail.report.state.jobId === detail.jobId ? <ResearchReport snapshot={detail.report} />
            : task.autonomy?.component && task.autonomy.component.state.jobId === detail.jobId ? <ResearchReport snapshot={task.autonomy.component} />
            : <><small>尚无该实验的指标报告</small>{detail.reflection && <p>{detail.reflection}</p>}{detail.result && detail.result.job_id === detail.jobId && <Collapse ghost size="small" items={[{ key: "result", label: "验收详情", children: <p>{detail.result.evaluation?.reason ?? "尚无验收结果"}</p> }]} />}</>}
          <Collapse ghost size="small" items={[{ key: "decision", label: "决策依据", children: <small>已尝试 {detail.attempts} 次 · 估计优先级 {detail.priority.toFixed(2)}<br />估计收益 {detail.expected_gain} · 估计成功率 {Math.round(detail.confidence * 100)}% · 估计成本 {detail.cost}</small> }]} />
        </>}
      </aside>}
    </div>
  </section>;
}
