/* LianAgent 停靠布局参数与宽度约束，使用 Yunfeng 独立偏好键。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
export type PanelId = "navigation" | "workbench";
export interface WorkspaceLayout {
  reversed: boolean;
  navigation: number;
  workbench: number;
  navigationOpen: boolean;
  workbenchOpen: boolean;
}
export const PANEL_COMPACT_WIDTH = 64;
export const PANEL_SNAP_THRESHOLD = 160;
export const PANEL_MAX_WIDTH = { navigation: 420, workbench: 480 };
export const DEFAULT_LAYOUT: WorkspaceLayout = {
  reversed: false, navigation: 248, workbench: 320,
  navigationOpen: true, workbenchOpen: true,
};
export function normalizePanelWidth(panel: PanelId, width: number): number {
  return Math.round(Math.min(PANEL_MAX_WIDTH[panel], Math.max(PANEL_COMPACT_WIDTH,
    Number.isFinite(width) ? width : DEFAULT_LAYOUT[panel])));
}
export function snapPanelWidth(panel: PanelId, width: number): number {
  const normalized = normalizePanelWidth(panel, width);
  return normalized <= PANEL_SNAP_THRESHOLD ? PANEL_COMPACT_WIDTH : normalized;
}
/** 窗口变窄时先收缩导航，保留中心阅读宽度；不覆盖用户保存的宽度。 */
export function fitWorkspaceLayout(layout: WorkspaceLayout, viewport: number): WorkspaceLayout {
  if (viewport < 656) return layout;
  const fitted = { ...layout };
  let overflow = (layout.navigationOpen ? layout.navigation : 0)
    + (layout.workbenchOpen ? layout.workbench : 0) + 504 - viewport;
  for (const panel of ["navigation", "workbench"] as const) {
    if (!layout[`${panel}Open`] || overflow <= 0) continue;
    const width = snapPanelWidth(panel, fitted[panel] - overflow);
    overflow -= fitted[panel] - width;
    fitted[panel] = width;
  }
  return fitted;
}
export function readWorkspaceLayout(): WorkspaceLayout {
  try {
    const value = JSON.parse(localStorage.getItem("yunfeng.workspace-layout.v1") ?? "null") as Partial<WorkspaceLayout> | null;
    return {
      ...DEFAULT_LAYOUT,
      reversed: value?.reversed === true,
      navigation: snapPanelWidth("navigation", value?.navigation ?? DEFAULT_LAYOUT.navigation),
      workbench: snapPanelWidth("workbench", value?.workbench ?? DEFAULT_LAYOUT.workbench),
      navigationOpen: typeof value?.navigationOpen === "boolean" ? value.navigationOpen : true,
      workbenchOpen: typeof value?.workbenchOpen === "boolean" ? value.workbenchOpen : true,
    };
  } catch { return { ...DEFAULT_LAYOUT }; }
}
