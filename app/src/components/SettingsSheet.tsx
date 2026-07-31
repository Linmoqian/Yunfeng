import { Check, X } from "lucide-react";
import type { Theme } from "@/hooks/useTheme";
import { Button } from "./ui/button";

interface SettingsSheetProps {
  open: boolean;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  projectRoot: string | null;
  onPickDirectory: () => void;
  onClose: () => void;
}

const THEMES: { id: Theme; label: string; bg: string; border: string }[] = [
  { id: "light", label: "浅色", bg: "#f5f5f7", border: "#d2d2d7" },
  { id: "dark", label: "深色", bg: "#161617", border: "#3a3a3c" },
];

/** 设置弹层：主题切换 + 项目目录。 */
export function SettingsSheet({
  open,
  theme,
  onThemeChange,
  projectRoot,
  onPickDirectory,
  onClose,
}: SettingsSheetProps) {
  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>设置</h2>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="settings-group">
          <div className="settings-label">主题</div>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-option${theme === t.id ? " is-selected" : ""}`}
                onClick={() => onThemeChange(t.id)}
              >
                <span
                  className="theme-swatch"
                  style={{ background: t.bg, borderColor: t.border }}
                />
                {t.label}
                {theme === t.id && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-label">项目目录</div>
          <div className="field-row">
            <span title={projectRoot ?? ""}>{projectRoot ?? "未选择"}</span>
            <Button size="sm" onClick={onPickDirectory}>
              选择目录
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
