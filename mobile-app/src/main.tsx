import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauriRuntime } from "@/lib/platform";
import { THEME_STORAGE_KEY } from "@/hooks/useTheme";
import "./index.css";

// 在 React mount 前同步设置主题，避免闪烁
const initialTheme = localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
document.documentElement.setAttribute("data-theme", initialTheme);

if (isTauriRuntime()) {
  // 桌面无边框标识（触发 app-shell 圆角浮起样式）
  document.documentElement.classList.add("desktop-main");
  // 禁用浏览器默认右键菜单
  window.addEventListener("contextmenu", (e) => e.preventDefault(), { capture: true });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
