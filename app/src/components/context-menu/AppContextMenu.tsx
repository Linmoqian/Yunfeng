/* 统一圆角右键菜单；标签与会话已有菜单通过 preventDefault 优先接管。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { App, Dropdown, type MenuProps } from "antd";
import { ArrowLeft, Copy, Scissors, ClipboardPaste, RefreshCw, TextSelect } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { captureEditTarget } from "./editTarget";
import styles from "./AppContextMenu.module.css";

export function AppContextMenu({ children, extraItems = [], onAction }: {
  children: ReactNode; extraItems?: MenuProps["items"]; onAction?: (key: string) => void;
}) {
  const { message } = App.useApp();
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [items, setItems] = useState<MenuProps["items"]>([]);
  const edit = useRef<ReturnType<typeof captureEditTarget> | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!point) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPoint(null);
      origin.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [point]);
  return <div className={styles.host} onContextMenu={(event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    origin.current = event.target as HTMLElement;
    const target = captureEditTarget(origin.current);
    edit.current = target;
    const editing = target.editable !== null;
    setItems([
      ...(editing ? [
        { key: "cut", label: "剪切", icon: <Scissors size={15} />, disabled: !target.canEdit || !target.text },
        { key: "paste", label: "粘贴", icon: <ClipboardPaste size={15} />, disabled: !target.canEdit },
      ] : []),
      { key: "copy", label: "复制", icon: <Copy size={15} />, disabled: !target.text },
      { key: "selectAll", label: "全选", icon: <TextSelect size={15} /> },
      ...(!editing ? [{ type: "divider" as const }, ...(extraItems ?? []),
        { key: "back", label: "返回", icon: <ArrowLeft size={15} />, disabled: window.history.length < 2 },
        { key: "reload", label: "刷新页面", icon: <RefreshCw size={15} /> }] : []),
    ]);
    setPoint({ x: event.clientX, y: event.clientY });
  }}>
    {children}
    <Dropdown trigger={[]} open={point !== null} placement="bottomLeft" autoAdjustOverflow autoFocus overlayClassName={styles.popup}
      onOpenChange={(open) => { if (!open) { setPoint(null); origin.current?.focus({ preventScroll: true }); } }}
      menu={{ items, onKeyDown: (event) => { if (event.key === "Escape") { setPoint(null); origin.current?.focus({ preventScroll: true }); } }, onClick: ({ key }) => {
        setPoint(null);
        origin.current?.focus({ preventScroll: true });
        if (["cut", "copy", "paste", "selectAll"].includes(key)) void edit.current?.run(key).catch(() => message.error("剪贴板操作失败，请使用键盘快捷键。"));
        else if (key === "back") window.history.back();
        else if (key === "reload") window.location.reload();
        else onAction?.(key);
      } }}>
      <span aria-hidden className={styles.anchor} style={{ left: point?.x ?? 0, top: point?.y ?? 0 }} />
    </Dropdown>
  </div>;
}
