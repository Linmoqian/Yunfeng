// 浮动变体切换器（prototype skill: UI.md）
// 固定在屏幕底部中央，左右箭头循环切换，键盘 ←/→ 切换（输入聚焦时不拦截）。
// 仅在开发模式显示，避免原型条泄漏到生产构建。

import { useEffect } from "react";
import { VARIANT_NAMES } from "./variants/variantTypes";

interface PrototypeSwitcherProps {
  variants: string[];
  current: string;
  onChange: (variant: string) => void;
}

export function PrototypeSwitcher({ variants, current, onChange }: PrototypeSwitcherProps) {
  const index = variants.indexOf(current);
  const label = VARIANT_NAMES[current] ?? current;

  const cycle = (dir: 1 | -1) => {
    if (variants.length === 0) return;
    const next = (index + dir + variants.length) % variants.length;
    onChange(variants[next]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        cycle(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        cycle(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, variants, current]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="proto-switcher" data-testid="proto-switcher">
      <button className="proto-switcher-btn" onClick={() => cycle(-1)} title="上一个变体 (←)">
        ←
      </button>
      <span className="proto-switcher-label">
        {current} — {label}
      </span>
      <button className="proto-switcher-btn" onClick={() => cycle(1)} title="下一个变体 (→)">
        →
      </button>
    </div>
  );
}
