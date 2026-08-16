import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "./ui/button";

interface ConnectionBannerProps {
  online: boolean | null;
  onRetry: () => void;
}

/** 全局断线横幅：网关不可达时提示重连中，提供手动重试。 */
export function ConnectionBanner({ online, onRetry }: ConnectionBannerProps) {
  if (online !== false) return null;
  return (
    <div className="connection-banner" role="alert">
      <WifiOff size={15} />
      <span>与电脑的连接已断开，正在自动重连…</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw size={12} />
        立即重试
      </Button>
    </div>
  );
}
