/* 三栏与会话标签组装；已打开会话保持挂载，切换不打断流或清空草稿。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { lazy, Suspense, useEffect, useState } from "react";
import type { ModelCatalog, ModelSelection, SessionSnapshot, TaskState } from "../../../services/taskService";
import { sessionToLegacySummary, taskToSummary, type TaskSummary } from "../taskPresentation";
import { useWorkspaceTabs, type WorkspaceTab } from "../hooks/useWorkspaceTabs";
import { useTeamWorkspace } from "../hooks/useTeamWorkspace";
import { WorkspaceShell } from "./WorkspaceShell";
import { ConnectionCapsule } from "./ConnectionCapsule";
import { ConversationLoading } from "./ConversationLoading";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { WorkspaceWorkbench } from "./WorkspaceWorkbench";
import { WorkspaceUtility } from "./WorkspaceUtility";
import { TeamChat } from "./TeamChat";
import { TeamContacts } from "./TeamContacts";
import { TeamWorkbench } from "./TeamWorkbench";
import { WorkspaceSettings, type WorkspaceSettingsProps } from "./WorkspaceSettings";
import { OverviewPane } from "../../../routes/workbench/components/OverviewPane";
import shell from "./WorkspaceShell.module.css";
import { PaperWritingContext, usePaperWriting } from "../hooks/usePaperWriting";
import { PaperNavigation } from "./PaperNavigation";
import { PaperMaterials } from "./PaperMaterials";
import { PaperWriting } from "./PaperWriting";

const TaskFocusPanel = lazy(() => import("../TaskFocusPanel").then((module) => ({ default: module.TaskFocusPanel })));
const TaskboardPage = lazy(() => import("../../../routes/taskboard/TaskboardPage").then((module) => ({ default: module.TaskboardPage })));
interface WorkspaceViewProps {
  navigationLoading?: boolean; navigationError?: string | null;
  tasks: TaskState[]; sessions: SessionSnapshot[]; summaries: TaskSummary[];
  currentTaskId: string | null; currentSessionId: string | null;
  initialMessage: { taskId: string; text: string } | null; search: string;
  modelCatalog: ModelCatalog; modelSelection: ModelSelection | null;
  onSearch: (value: string) => void; onOpen: (task: TaskSummary) => void; onNew: () => void;
  onClear: () => void; onTaskUpdated: (task: TaskState) => void; onTaskCreated: (task: TaskState, text: string) => void;
  onRename: (id: string, title: string) => Promise<void>; onArchive: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>; archived: boolean; onArchivedChange: (value: boolean) => void;
  onSettings: () => void;
  settings: WorkspaceSettingsProps; notice: string | null; onReconnect: () => void;
}
export function WorkspaceView(props: WorkspaceViewProps) {
  const tabs = useWorkspaceTabs();
  const paper = usePaperWriting();
  const [teamOpen, setTeamOpen] = useState(false);
  const team = useTeamWorkspace(teamOpen);
  const [infoContainer, setInfoContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.currentTaskId) {
      const task = props.tasks.find((item) => item.id === props.currentTaskId);
      if (task) tabs.open({ id: `task-${task.id}`, title: task.title, kind: "task", entityId: task.id });
    } else if (props.currentSessionId) {
      const session = props.sessions.find((item) => item.id === props.currentSessionId);
      if (session) tabs.open({ id: `session-${session.id}`, title: session.name || session.firstMessage || "旧会话", kind: "session", entityId: session.id });
    }
    // 仅响应选择和初始数据到达，状态更新不抢占正在浏览的工具标签。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.currentTaskId, props.currentSessionId, Boolean(props.tasks.length), Boolean(props.sessions.length)]);
  function startNew() {
    setTeamOpen(false);
    tabs.open({ id: `draft-${crypto.randomUUID()}`, title: "新建会话", kind: "draft" });
    props.onNew();
  }
  function openTask(task: TaskSummary) {
    setTeamOpen(false);
    tabs.open({ id: `${task.isLegacy ? "session" : "task"}-${task.isLegacy ? task.sessionId : task.id}`, title: task.title, kind: task.isLegacy ? "session" : "task", entityId: task.isLegacy ? task.sessionId : task.id });
    props.onOpen(task);
  }
  function activate(id: string) {
    tabs.setActive(id);
    const tab = tabs.items.find((item) => item.id === id);
    if (tab?.kind === "draft") { props.onNew(); return; }
    const task = props.tasks.find((item) => tab?.kind === "task" && item.id === tab.entityId);
    const session = props.sessions.find((item) => tab?.kind === "session" && item.id === tab.entityId);
    if (task) props.onOpen(taskToSummary(task));
    else if (session) props.onOpen(sessionToLegacySummary(session));
  }
  function close(id: string) { const next = tabs.close(id); if (next !== "home") activate(next); else props.onClear(); }
  function reopen() { const tab = tabs.reopen(); if (tab) { const task = props.summaries.find((item) => item.id === tab.entityId || item.sessionId === tab.entityId); if (task) props.onOpen(task); } }
  function openUtility(id: string, title: string) { setTeamOpen(false); tabs.open({ id, title, kind: "utility" }); }
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || props.settings.open || event.isComposing) return;
      if (event.key.toLowerCase() === "t") { event.preventDefault(); if (event.shiftKey) reopen(); else startNew(); }
      if (event.key.toLowerCase() === "w") { event.preventDefault(); close(tabs.active); }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  });
  function resolveTitle(tab: WorkspaceTab): string {
    const task = props.tasks.find((item) => tab.kind === "task" && item.id === tab.entityId);
    const session = props.sessions.find((item) => tab.kind === "session" && item.id === tab.entityId);
    return tab.renamed ? tab.title : task?.title ?? session?.name ?? tab.title;
  }
  function renderSession(tab: WorkspaceTab) {
    const task = props.tasks.find((item) => item.id === tab.entityId);
    const session = props.sessions.find((item) => item.id === tab.entityId);
    if (tab.kind === "utility") {
      if (tab.id === "board") return tabs.active === tab.id && !teamOpen ? <TaskboardPage embedded /> : null;
      if (tab.id === "tool-writing") return <PaperWriting />;
      return <WorkspaceUtility id={tab.id} title={tab.title} />;
    }
    if (tab.kind !== "draft" && !task && !session) return props.navigationLoading ? <ConversationLoading /> : <div className={shell.notice} role="status">
      <span>该会话暂时无法读取</span><button type="button" onClick={props.onReconnect}>重试读取</button>
    </div>;
    return <TaskFocusPanel draft={tab.kind === "draft"} task={tab.kind === "task" ? task : undefined} legacySession={tab.kind === "session" ? session : undefined}
      sessions={props.sessions} modelCatalog={props.modelCatalog} modelSelection={props.modelSelection}
      infoContainer={tabs.active === tab.id && !teamOpen ? infoContainer : null} showInfo={tabs.active === tab.id && !teamOpen}
      initialMessage={props.initialMessage?.taskId === task?.id ? props.initialMessage?.text : undefined}
      onTaskUpdated={props.onTaskUpdated}
      onTaskCreated={(created, text) => { tabs.replace(tab.id, { id: `task-${created.id}`, title: created.title, kind: "task", entityId: created.id }); props.onTaskCreated(created, text); }} />;
  }
  return <PaperWritingContext.Provider value={paper}>
    <WorkspaceShell team={teamOpen}
      toolPanels={!teamOpen && tabs.active === "tool-writing" ? { leftTitle: "参考文献与章节", rightTitle: "图文素材", left: <PaperNavigation onBack={() => { tabs.setActive("home"); props.onClear(); }} />, right: <PaperMaterials /> } : undefined}
      navigation={<><div className={shell.dockStage} hidden={teamOpen}><WorkspaceNavigation loading={props.navigationLoading && !props.tasks.length && !props.sessions.length} error={props.navigationError} onRetry={props.onReconnect} tasks={props.summaries} activeId={props.currentTaskId ?? props.currentSessionId ?? undefined}
        search={props.search} onSearch={props.onSearch} onOpen={openTask} onNew={startNew} onUtility={openUtility} onTeam={() => setTeamOpen(true)} onSettings={props.onSettings} onRename={props.onRename} onArchive={props.onArchive} onReopen={props.onReopen} archived={props.archived} onArchivedChange={props.onArchivedChange} /></div>
        <div className={shell.dockStage} hidden={!teamOpen}><TeamContacts state={team} onBack={() => setTeamOpen(false)} /></div></>}
      workbench={<><div className={shell.dockStage} hidden={teamOpen}><WorkspaceWorkbench tasks={props.summaries} onOpen={openTask} onUtility={openUtility} infoRef={setInfoContainer} /></div>
        <div className={shell.dockStage} hidden={!teamOpen}><TeamWorkbench state={team} /></div></>}>
      {teamOpen ? <TeamChat state={team} onBack={() => setTeamOpen(false)} /> : <>
        <WorkspaceTabs tabs={tabs} onActivate={activate} onClose={close} onNew={startNew} onReopen={reopen} resolveTitle={resolveTitle} />
        <ConnectionCapsule busy={props.settings.connectionState !== "connected"} error={props.notice} onRetry={props.onReconnect} />
      </>}
      <div className={shell.stage} hidden={teamOpen} style={teamOpen ? { display: "none" } : undefined}>
        {tabs.items.map((tab) => <div key={tab.id} className={shell.sessionStage} hidden={tab.id !== tabs.active} role="tabpanel" aria-label={resolveTitle(tab)}><Suspense fallback={<ConversationLoading />}>{renderSession(tab)}</Suspense></div>)}
        {tabs.active === "home" && <OverviewPane hasAny={props.tasks.length > 0} onNewTask={startNew} />}
      </div>
    </WorkspaceShell>
    <WorkspaceSettings {...props.settings} />
  </PaperWritingContext.Provider>;
}
