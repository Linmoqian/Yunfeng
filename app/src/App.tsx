import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import { useAppBehavior } from "./hooks/useAppBehavior";
import { TitleBar } from "./components/titlebar/TitleBar";
import { AppContextMenu } from "./components/context-menu/AppContextMenu";
import { getRuntimeWindowPlatform } from "./components/titlebar/windowPlatform";
import { WorkbenchPage } from "./routes/workbench/WorkbenchPage";
import { ComponentWindow } from "./features/workbench/components/ComponentWindow";

const TaskboardPage = lazy(() => import("./routes/taskboard/TaskboardPage").then((module) => ({
  default: module.TaskboardPage,
})));

// 路由：工作台为单一页面，task/session 深链接通过 URL query 承载（见 syncUrl）。
// 引入 React Router 以建立可扩展的路由边界，后续如新增独立页面直接在 children 扩展。
const router = createBrowserRouter([
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
]);

export function App() {
  useAppBehavior();
  return (
    <div className="app-root" data-desktop={getRuntimeWindowPlatform() !== "browser" || undefined}>
      <AppContextMenu>
        <TitleBar />
        <div className="app-viewport">
          <RouterProvider router={router} />
        </div>
      </AppContextMenu>
    </div>
  );
}
