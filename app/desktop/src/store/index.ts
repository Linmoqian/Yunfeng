// 根 Store：跨页面工作流状态挂载点。业务数据仍以后端/事件流为事实来源，
// Redux 仅承载工作台编排副本，避免与其冲突（详见 frontend.md）。

import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";

import workbenchReducer from "./workbenchSlice";

export const store = configureStore({
  reducer: {
    workbench: workbenchReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
