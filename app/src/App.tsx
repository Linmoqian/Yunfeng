// 宿主页面：数据层 hooks 在此统一管理，
// 渲染由 ?variant= 参数选择（prototype skill: UI.md 子形态 A）。
import { useCallback, useEffect, useState } from "react";
import { VariantA } from "./components/variants/VariantA";
import { VariantB } from "./components/variants/VariantB";
import { VariantC } from "./components/variants/VariantC";
import { PrototypeSwitcher } from "./components/PrototypeSwitcher";
import { useSidecar } from "./hooks/useSidecar";
import { useSessions } from "./hooks/useSessions";
import { useSession } from "./hooks/useSession";
import { useFileTree } from "./hooks/useFileTree";
import { useModels } from "./hooks/useModels";
import "./App.css";
import "./variants.css";

const VARIANTS = ["A", "B", "C"];

function readVariant(): string {
  const v = new URLSearchParams(window.location.search).get("variant");
  return v && VARIANTS.includes(v) ? v : "A";
}

function App() {
  const sidecar = useSidecar();
  const sessions = useSessions(sidecar.client);
  const session = useSession(sidecar.client);
  const fileTree = useFileTree(sidecar.client);
  const models = useModels(sidecar.client);
  const [variant, setVariant] = useState(readVariant);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // 启动 sidecar
  useEffect(() => {
    if (sidecar.status === "idle") {
      sidecar.start().catch((e: unknown) => {
        setBannerError(e instanceof Error ? e.message : String(e));
      });
    }
  }, [sidecar]);

  // sidecar 就绪后恢复 projectRoot（从本地存储）
  useEffect(() => {
    if (sidecar.status === "ready") {
      const saved = localStorage.getItem("pi-project-root");
      if (saved) {
        sessions.restoreProject(saved);
        fileTree.setRoot(saved);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidecar.status]);

  // 变体切换写入 URL，保证可分享、刷新稳定
  const changeVariant = useCallback((v: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", v);
    window.history.replaceState(null, "", url);
    setVariant(v);
  }, []);

  const commonProps = {
    sidecar,
    sessions,
    session,
    fileTree,
    models,
    bannerError,
    dismissBannerError: () => setBannerError(null),
  };

  return (
    <div className="app">
      {variant === "A" && <VariantA {...commonProps} />}
      {variant === "B" && <VariantB {...commonProps} />}
      {variant === "C" && <VariantC {...commonProps} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={changeVariant} />
    </div>
  );
}

export default App;
