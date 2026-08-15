import { Monitor, Play, Square, X } from "lucide-react";
import type { RemoteDesktopState } from "@/hooks/useRemoteDesktop";
import { Button } from "./ui/button";

interface RemoteDesktopPanelProps {
  remote: RemoteDesktopState;
  onClose: () => void;
}

/** 远程屏幕浮层：配对设备后按帧查看电脑屏幕。 */
export function RemoteDesktopPanel({ remote, onClose }: RemoteDesktopPanelProps) {
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="remote-panel" onClick={(e) => e.stopPropagation()}>
        <header className="remote-header">
          <h2>
            <Monitor size={16} />
            电脑屏幕
          </h2>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="remote-body">
          {remote.status === "error" && <div className="empty-hint is-error">{remote.error}</div>}
          {!remote.token && (
            <div className="empty-hint">尚未配对，请先在设置中填写移动后端地址并输入配对码。</div>
          )}
          {remote.token && remote.frame && (
            <img
              className="remote-frame"
              src={`data:${remote.frame.mime};base64,${remote.frame.data}`}
              alt={`电脑屏幕帧 ${remote.frame.seq}`}
            />
          )}
          {remote.token && !remote.frame && remote.status !== "error" && (
            <div className="empty-hint">
              {remote.status === "connecting" ? "连接中…" : "点击开始查看电脑屏幕"}
            </div>
          )}
        </div>

        <footer className="remote-footer">
          {remote.status === "running" ? (
            <Button size="sm" onClick={remote.stop}>
              <Square size={14} />
              停止
            </Button>
          ) : (
            <Button size="sm" disabled={!remote.token} onClick={() => remote.start(2)}>
              <Play size={14} />
              开始
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
