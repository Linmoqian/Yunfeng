/* 科研中央关系图：读取 Runtime 快照，保留缩放位置并按需查看节点。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { useMemo, useRef, useState } from "react";
import { useResearchGraphSummaries } from "../hooks/useResearchGraphSummaries";
import { useResearchGraphComponent } from "../hooks/useResearchGraphComponent";
import { Capsule } from "./Capsule";
import { Button } from "antd";
import { MessageSquare, RefreshCw, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { ReactFlow, Handle, Position, MarkerType, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TaskState } from "../../../services/taskService";
import type { RelevanceControl } from "./ResearchRelevance";
import { ResearchNodeCapsules } from "./ResearchNodeCapsules";
import { researchNodeInfo, type NodeInfo } from "../researchNodeInfo";
import { layoutResearchGraph, researchNodeText, researchNodeStatus, type ResearchGraphItem } from "../researchGraph";
import styles from "./ResearchGraph.module.css";
import { BranchNode } from "../../../components/common/BranchNode";

type GraphNode = Node<ResearchGraphItem & { agent?: boolean; expanded: boolean; info: NodeInfo; relevance: RelevanceControl; onInspect: (id: string) => void }, "research">;
function ResearchNode({ data }: NodeProps<GraphNode>) {
  const text = researchNodeText(data);
  return <BranchNode title={text.title} summary={text.summary} status={data.status} current={data.current} agent={data.agent} kind={data.kind} expanded={data.expanded}
    label={`${text.title} · ${data.kind === "mission" ? "研究目标" : data.kind === "group" ? "分组" : researchNodeStatus[data.status]}`} onClick={() => data.onInspect(data.id)}>
    <ResearchNodeCapsules expanded={data.expanded} info={data.info} relevance={data.relevance} />
    <Handle id="in-left" type="target" position={Position.Left} /><Handle id="in-right" type="target" position={Position.Right} />
    <Handle id="out-left" type="source" position={Position.Left} /><Handle id="out-right" type="source" position={Position.Right} />
  </BranchNode>;
}
const nodeTypes = { research: ResearchNode };
const options = { hideAttribution: true };
// 保留只读节点的命中区域；展开由节点按钮处理，避免重复切换。
const keepNodeHitArea = () => {};
export function ResearchGraph({ task, onClose }: { task: TaskState; onClose: () => void }) {
  const decision = task.autonomy?.decision;
  const summaries = useResearchGraphSummaries(task.id, task.lastEventSeq, decision, task.autonomy?.phase);
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
  const names = useMemo(() => Object.fromEntries(graph?.items.map((item) => [item.id, researchNodeText(item).title]) ?? []), [graph]);
  const nodes = useMemo(() => graph?.items.map((item): GraphNode => ({
    id: item.id, type: "research", position: item.position,
    data: { ...item, agent: control.agentTarget === item.id, expanded: inspected === item.id, info: researchNodeInfo(task, item.id),
      onInspect: (id) => setInspected((previous) => previous === id ? null : id),
      relevance: { task: task.id, node: item.id, revision: task.lastEventSeq, names, inspect: (id) => {
        setInspected(id);
        const target = graph.items.find((node) => node.id === id);
        if (target && flow.current) void flow.current.setCenter(target.position.x + 110, target.position.y + 40, { zoom: flow.current.getZoom() });
      } },
    },
  })) ?? [], [graph, control.agentTarget, inspected, task, names]);
  return <section ref={control.root} className={styles.graph} aria-label="科研分支关系图" onKeyDown={(event) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
    if (inspected) setInspected(null); else onClose();
  }}>
    <header className={styles.toolbar}><span>研究分支<span className={styles.count}>{decision?.nodes.length ?? 0} 个节点</span></span>{summaries.busy && <Capsule>整理节点</Capsule>}{(control.agentTarget || control.yielded) && <Capsule value={control.agentTarget ?? "yielded"}>{control.yielded ? "已让出控制" : "云枫聚焦"}</Capsule>}<div>
      {summaries.error && <Button type="text" size="small" title="节点概述暂未生成，检查模型配置后重试" aria-label="重试节点概述" icon={<RefreshCw size={15} />} onClick={summaries.retry} />}
      <Button type="text" size="small" title="适应画布" aria-label="适应画布" icon={<Scan size={15} />} onClick={() => void flow.current?.fitView({ padding: 0.2, maxZoom: 1 })} />
      <Button type="text" size="small" title="放大关系图" aria-label="放大关系图" icon={<ZoomIn size={15} />} onClick={() => void flow.current?.zoomIn()} />
      <Button type="text" size="small" title="缩小关系图" aria-label="缩小关系图" icon={<ZoomOut size={15} />} onClick={() => void flow.current?.zoomOut()} />
      <Button type="text" size="small" title="返回对话" aria-label="返回对话" icon={<MessageSquare size={15} />} onClick={onClose} />
    </div></header>
    <div className={styles.canvas}>
      {graph ? <ReactFlow<GraphNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onMoveStart={(event) => { if (event) control.yieldControl(); }}
        onNodeClick={keepNodeHitArea} onPaneClick={() => setInspected(null)}
        onInit={(instance) => { flow.current = instance; void instance.setCenter(110, 40, { zoom: 0.85 }); }} nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
        elementsSelectable={false} zoomOnDoubleClick={false} minZoom={0.15} maxZoom={1.5} proOptions={options} />
        : <div className={styles.empty}>目标树尚未生成，Agent 规划后会自动呈现。</div>}
      {Boolean(graph?.disconnected) && <p className={styles.warning}>部分节点缺少有效父关系，暂未连线。</p>}
    </div>
  </section>;
}
