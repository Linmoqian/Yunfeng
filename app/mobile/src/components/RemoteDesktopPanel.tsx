import { Copy, ExternalLink, Monitor, Play, Square, X } from "lucide-react";
import type { RemoteDesktopState } from "@/hooks/useRemoteDesktop";
import { Button } from "./ui/button";

interface RemoteDesktopPanelProps {
  remote: RemoteDesktopState;
  onClose: () => void;
}

/** 远程屏幕浮层：启动电脑侧内嵌 RustDesk，并引导打开官方 App 连接。 */
export function RemoteDesktopPanel({ remote, onClose }: RemoteDesktopPanelProps) {
  const hasId = remote.info?.id !== null && remote.info?.id !== undefined && remote.info.id.length > 0;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="remote-panel" onClick={(e) => e.stopPropagation()}>
        <header className="remote-header">
          <h2>
            <Monitor size={16} />
            远程桌面（RustDesk）
          </h2>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="remote-body rustdesk-body">
          {remote.status === "error" && <div className="empty-hint is-error">{remote.error}</div>}
          {remote.token === "" && (
            <div className="empty-hint">尚未配对，请先在设置中填写移动后端地址并输入配对码。</div>
          )}
          {remote.token !== "" && (
            <div className="rustdesk-info">
              <div className="rustdesk-field">
                <span>RustDesk ID</span>
                <strong>{hasId ? remote.info?.id : "启动后显示"}</strong>
                {hasId && (
                  <button
                    type="button"
                    className="icon-button"
                    title="复制 ID"
                    onClick={() => void navigator.clipboard?.writeText(String(remote.info?.id))}
                  >
                    <Copy size={14} />
                  </button>
                )}
              </div>
              <div className="rustdesk-field">
                <span>连接密码</span>
                <strong>
                  {remote.password === null
                    ? remote.info?.passwordConfigured
                      ? "已设置（在 RustDesk 中查看）"
                      : "未设置，请先在电脑端 RustDesk 设置"
                    : remote.password}
                </strong>
                {remote.password !== null && (
                  <button
                    type="button"
                    className="icon-button"
                    title="复制密码"
                    onClick={() => void navigator.clipboard?.writeText(String(remote.password))}
                  >
                    <Copy size={14} />
                  </button>
                )}
              </div>
              <div className="rustdesk-field">
                <span>服务状态</span>
                <strong>
                  {remote.info?.running === true
                    ? `运行中（${remote.info.mode === "service" ? "后台服务" : "界面模式"}）`
                    : remote.status === "starting"
                      ? "启动中…"
                      : "已停止"}
                </strong>
              </div>
            </div>
          )}
        </div>

        <footer className="remote-footer">
          {remote.info?.running === true ? (
            <>
              <Button size="sm" variant="outline" onClick={() => void remote.stop()}>
                <Square size={14} />
                停止
              </Button>
              <Button size="sm" disabled={hasId === false} onClick={remote.openRustDeskApp}>
                <ExternalLink size={14} />
                打开 RustDesk
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={remote.token === ""} onClick={() => void remote.start("service")}>
              <Play size={14} />
              {remote.status === "error" ? "重新启动" : "启动"}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
