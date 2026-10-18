/* 应用路由与共享指针提示的组装入口。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import { useAppBehavior } from "./hooks/useAppBehavior";
import { TitleBar } from "./components/titlebar/TitleBar";
import { AppContextMenu } from "./components/context-menu/AppContextMenu";
import { getRuntimeWindowPlatform } from "./components/titlebar/windowPlatform";
import { WorkbenchPage } from "./routes/workbench/WorkbenchPage";
import { AgentFocusOverlay } from "./features/workbench/components/AgentFocusOverlay";
import { ComponentWindow } from "./features/workbench/components/ComponentWindow";

const TaskboardPage = lazy(() => import("./routes/taskboard/TaskboardPage").then((module) => ({
  default: module.TaskboardPage,
})));
const UiLibraryPage = import.meta.env.DEV ? lazy(() => import("./routes/ui-library/UiLibraryPage").then((module) => ({ default: module.UiLibraryPage }))) : null;
const EvaluationPanel = lazy(() => import("./features/evaluation/EvaluationPanel").then((module) => ({ default: module.EvaluationPanel })));

// 路由：工作台为单一页面，task/session 深链接通过 URL query 承载（见 syncUrl）。
// 引入 React Router 以建立可扩展的路由边界，后续如新增独立页面直接在 children 扩展。
const router = createBrowserRouter([
  ...(UiLibraryPage ? [{ path: "/dev/ui", element: <Suspense fallback={null}><UiLibraryPage /></Suspense> }] : []),
  { path: "/component/:component", element: <ComponentWindow /> },
  {
    path: "/",
    element: <WorkbenchPage />,
    // 未知路径回落工作台，避免首屏白屏。
    errorElement: <Navigate to="/" replace />,
  },
  {
    path: "/taskboard",
    element: (
      <Suspense fallback={null}>
        <TaskboardPage />
      </Suspense>
    ),
  },
  { id: "evaluation", path: "/evaluation", element: <Suspense fallback={null}><EvaluationPanel /></Suspense> },
]);

export function App() {
  useAppBehavior();
  return (
    <div className="app-root" data-desktop={getRuntimeWindowPlatform() !== "browser" || undefined}>
      <AppContextMenu>
        <TitleBar />
        <AgentFocusOverlay />
        <div className="app-viewport">
          <RouterProvider router={router} />
        </div>
      </AppContextMenu>
    </div>
  );
}
