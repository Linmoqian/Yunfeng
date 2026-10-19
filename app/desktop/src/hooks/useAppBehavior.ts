// 全局应用行为：隐藏视觉滚动条（保留滚轮/触控板/键盘滚动）、
// 禁用浏览器默认右键菜单（桌面应用常用自定义菜单，本项目为 Web 亦保持一致）。

import { useEffect } from "react";

export function useAppBehavior(): void {
  useEffect(() => {
    // 禁用默认右键菜单：产品交互由自定义菜单栏/操作承载。
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", preventContextMenu);
    return () => window.removeEventListener("contextmenu", preventContextMenu);
  }, []);

  useEffect(() => {
    // 隐藏视觉滚动条但保留滚动能力：全局样式在 global.css 中以
    // :-webkit-scrollbar { display: none } 实现，此处只需确保 html 可滚动。
    document.documentElement.style.scrollbarWidth = "none";
    document.body.style.scrollbarWidth = "none";
  }, []);
}
