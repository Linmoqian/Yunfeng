/* LianAgent 三栏外壳，业务内容由 Yunfeng 插槽提供。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { PanelLeft, PanelRight, RotateCcw } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { AppContextMenu } from "../../../components/context-menu/AppContextMenu";
import { useWorkspaceLayout } from "../hooks/useWorkspaceLayout";
import { DockPanel } from "./DockPanel";
import styles from "./WorkspaceShell.module.css";

export function WorkspaceShell({ navigation, workbench, children, team = false }: {
  navigation: ReactNode; workbench: ReactNode; children: ReactNode; team?: boolean;
}) {
  const dock = useWorkspaceLayout();
  useEffect(() => {
    const reset = () => dock.reset();
    window.addEventListener("yunfeng-reset-layout", reset);
    return () => window.removeEventListener("yunfeng-reset-layout", reset);
  });
  return (
    <div className={styles.shell} ref={dock.rootRef} data-resizing={Boolean(dock.resizing)}>
      <AppContextMenu extraItems={[
        { key: "navigation", label: dock.layout.navigationOpen ? "收起工作区" : "展开工作区", icon: <PanelLeft size={14} /> },
        { key: "workbench", label: dock.layout.workbenchOpen ? "收起工作台" : "展开工作台", icon: <PanelRight size={14} /> },
        { key: "swap", label: "左右分栏互换" }, { key: "reset", label: "重置分栏布局", icon: <RotateCcw size={14} /> },
      ]} onAction={(key) => { if (key === "swap") dock.swap(); else if (key === "reset") dock.reset(); else if (key === "navigation" || key === "workbench") dock.toggle(key); }}>
        <div className={styles.body}>
          <DockPanel panel="navigation" title={team ? "通讯录" : "工作区"} dock={dock}>{navigation}</DockPanel>
          <main className={styles.center} style={{ order: 1 }}>
            <div className={styles.recall}>
              <button type="button" aria-label="显示或隐藏工作区" aria-pressed={dock.layout.navigationOpen} onClick={() => dock.toggle("navigation")} title="显示或隐藏工作区"><PanelLeft size={16} /></button>
              <button type="button" aria-label="显示或隐藏工作台" aria-pressed={dock.layout.workbenchOpen} onClick={() => dock.toggle("workbench")} title="显示或隐藏工作台"><PanelRight size={16} /></button>
            </div>
            {children}
          </main>
          <DockPanel panel="workbench" title={team ? "共享工作台" : "工作台"} dock={dock}>{workbench}</DockPanel>
        </div>
      </AppContextMenu>
    </div>
  );
}
