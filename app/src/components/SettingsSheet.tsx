import { useState } from "react";
import { Check, Monitor, X } from "lucide-react";
import type { Theme } from "@/hooks/useTheme";
import type { UseGatewayResult } from "@/hooks/useGateway";
import type { RemoteDesktopState } from "@/hooks/useRemoteDesktop";
import { Button } from "./ui/button";

interface SettingsSheetProps {
  open: boolean;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  gateway: UseGatewayResult;
  remote: RemoteDesktopState;
  onOpenRemote: () => void;
  onClose: () => void;
}

const THEMES: { id: Theme; label: string; bg: string; border: string }[] = [
  { id: "light", label: "浅色", bg: "#f5f5f7", border: "#d2d2d7" },
  { id: "dark", label: "深色", bg: "#161617", border: "#3a3a3c" },
];

/** 设置弹层：主题、网关连接（Agent 任务/对话）、移动后端（远程屏幕）。 */
export function SettingsSheet({
  open,
  theme,
  onThemeChange,
  gateway,
  remote,
  onOpenRemote,
  onClose,
}: SettingsSheetProps) {
  const [gatewayUrl, setGatewayUrl] = useState(gateway.settings.baseUrl);
  const [gatewayToken, setGatewayToken] = useState(gateway.settings.token);
  const [backendUrl, setBackendUrl] = useState(remote.backendUrl);
  const [pairCode, setPairCode] = useState("");
  const [pairMessage, setPairMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

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
                <span className="theme-swatch" style={{ background: t.bg, borderColor: t.border }} />
                {t.label}
                {theme === t.id && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-label">Agent 网关（任务与对话）</div>
          <label className="field-label" htmlFor="gateway-url">
            地址
            <input
              id="gateway-url"
              value={gatewayUrl}
              placeholder="http://192.168.1.10:8787"
              onChange={(e) => setGatewayUrl(e.target.value)}
            />
          </label>
          <label className="field-label" htmlFor="gateway-token">
            Token
            <input
              id="gateway-token"
              value={gatewayToken}
              placeholder="YF_GATEWAY_READY 行中的 token"
              onChange={(e) => setGatewayToken(e.target.value)}
            />
          </label>
          <div className="field-row">
            <span>{testResult ?? gateway.testError ?? ""}</span>
            <Button
              size="sm"
              disabled={gateway.testing}
              onClick={() => {
                const next = { baseUrl: gatewayUrl, token: gatewayToken };
                gateway.save(next);
                void gateway.testConnection(next).then((ok) => setTestResult(ok ? "连接成功" : "连接失败"));
              }}
            >
              {gateway.testing ? "测试中…" : "保存并测试"}
            </Button>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-label">移动后端（配对与远程屏幕）</div>
          <label className="field-label" htmlFor="backend-url">
            地址
            <input
              id="backend-url"
              value={backendUrl}
              placeholder="http://192.168.1.10:8788"
              onChange={(e) => setBackendUrl(e.target.value)}
            />
          </label>
          <label className="field-label" htmlFor="pair-code">
            配对码（电脑端启动日志）
            <input
              id="pair-code"
              value={pairCode}
              inputMode="numeric"
              placeholder="6 位数字"
              onChange={(e) => setPairCode(e.target.value)}
            />
          </label>
          <div className="field-row">
            <span>{pairMessage ?? (remote.token ? "设备已配对" : "未配对")}</span>
            <div className="field-row-actions">
              {remote.token && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    remote.clearToken();
                    setPairMessage("已解除配对");
                  }}
                >
                  解除
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  remote.setBackendUrl(backendUrl);
                  void remote
                    .pair(backendUrl, pairCode, "yunfeng-mobile")
                    .then(() => setPairMessage("配对成功"))
                    .catch((e: unknown) => setPairMessage(e instanceof Error ? e.message : String(e)));
                }}
              >
                配对
              </Button>
            </div>
          </div>
          <div className="field-row">
            <span>查看电脑屏幕（远程桌面）</span>
            <Button size="sm" onClick={onOpenRemote}>
              <Monitor size={14} />
              打开屏幕
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
