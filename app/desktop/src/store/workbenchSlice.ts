// 工作台全局状态：跨页面/跨组件的任务编排工作流状态。
// 局部 UI 状态（弹窗开关、主题偏好、消息草稿）保留在组件内 useState/useReducer，不进入 Redux。

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { SessionSnapshot, TaskState } from "../services/taskService";

export type ConnectionState = "connecting" | "connected" | "offline";
export type ArchivedFilter = "all" | "active" | "archived";

export interface WorkbenchState {
  tasks: TaskState[];
  sessions: SessionSnapshot[];
  currentTaskId: string | null;
  currentSessionId: string | null;
  connectionState: ConnectionState;
  loadError: string | null;
  search: string;
  projectFilter: string;
  archivedFilter: ArchivedFilter;
  attentionCount: number;
}

const initialState: WorkbenchState = {
  tasks: [],
  sessions: [],
  currentTaskId: null,
  currentSessionId: null,
  connectionState: "connecting",
  loadError: null,
  search: "",
  projectFilter: "",
  archivedFilter: "active",
  attentionCount: 0,
};

function selectAttentionCount(tasks: TaskState[]): number {
  return tasks.filter((task) => task.status === "failed" || task.status === "waiting_approval").length;
}

const workbenchSlice = createSlice({
  name: "workbench",
  initialState,
  reducers: {
    snapshot: (state, action: PayloadAction<{ tasks: TaskState[]; sessions: SessionSnapshot[] }>) => {
      state.tasks = action.payload.tasks;
      state.sessions = action.payload.sessions;
      state.attentionCount = selectAttentionCount(action.payload.tasks);
    },
    tasksSnapshot: (state, action: PayloadAction<TaskState[]>) => {
      state.tasks = action.payload;
      state.attentionCount = selectAttentionCount(action.payload);
    },
    taskUpdated: (state, action: PayloadAction<TaskState>) => {
      const task = action.payload;
      const exists = state.tasks.some((existing) => existing.id === task.id);
      if (exists) {
        state.tasks = state.tasks.map((existing) => (existing.id === task.id ? task : existing));
      } else {
        state.tasks.push(task);
      }
      state.attentionCount = selectAttentionCount(state.tasks);
    },
    taskRemoved: (state, action: PayloadAction<string>) => {
      const taskId = action.payload;
      state.tasks = state.tasks.filter((task) => task.id !== taskId);
      if (state.currentTaskId === taskId) state.currentTaskId = null;
    },
    selectTask: (state, action: PayloadAction<string | null>) => {
      state.currentTaskId = action.payload;
      if (action.payload) state.currentSessionId = null;
    },
    selectSession: (state, action: PayloadAction<string | null>) => {
      state.currentSessionId = action.payload;
      if (action.payload) state.currentTaskId = null;
    },
    connection: (state, action: PayloadAction<{ state: ConnectionState; error?: string | null }>) => {
      state.connectionState = action.payload.state;
      if (action.payload.error !== undefined) state.loadError = action.payload.error;
    },
    search: (state, action: PayloadAction<string>) => {
      state.search = action.payload;
    },
    project: (state, action: PayloadAction<string>) => {
      state.projectFilter = action.payload;
    },
    archived: (state, action: PayloadAction<ArchivedFilter>) => {
      state.archivedFilter = action.payload;
    },
  },
});

export const workbenchActions = workbenchSlice.actions;
export default workbenchSlice.reducer;

export function getInitialSelection(): { taskId: string | null; sessionId: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { taskId: params.get("task"), sessionId: params.get("session") };
}
