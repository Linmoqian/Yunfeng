import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import App from "./App";
import "./index.css";

// 与 app/ 共用主题存储键，默认浅色，React mount 前设置避免闪烁
const initialTheme = localStorage.getItem("pi-desktop-theme") === "dark" ? "dark" : "light";
document.documentElement.setAttribute("data-theme", initialTheme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
