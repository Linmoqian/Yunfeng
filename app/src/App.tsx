// 宿主页面：数据层 hooks 在此统一管理（三变体共享），
// 路由 /a /b /c 决定渲染哪个变体，切换带 motion 过渡动画。
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { VariantA } from "./components/variants/VariantA";
import { VariantB } from "./components/variants/VariantB";
import { VariantC } from "./components/variants/VariantC";
import { PrototypeSwitcher } from "./components/PrototypeSwitcher";
import { useSidecar } from "./hooks/useSidecar";
import { useSessions } from "./hooks/useSessions";
import { useSession } from "./hooks/useSession";
import { useFileTree } from "./hooks/useFileTree";
import { useModels } from "./hooks/useModels";
import type { VariantProps } from "./components/variants/variantTypes";
import "./App.css";
import "./variants.css";

const VARIANTS = ["a", "b", "c"] as const;

function App() {
  const sidecar = useSidecar();
  const sessions = useSessions(sidecar.client);
  const session = useSession(sidecar.client);
  const fileTree = useFileTree(sidecar.client);
  const models = useModels(sidecar.client);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

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

  // 路由切换（PrototypeSwitcher 复用）
  const changeVariant = useCallback(
    (v: string) => navigate(`/${v}`),
    [navigate],
  );

  const commonProps: VariantProps = {
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
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          className="app-variant-host"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <Routes location={location}>
            <Route path="/a" element={<VariantA {...commonProps} />} />
            <Route path="/b" element={<VariantB {...commonProps} />} />
            <Route path="/c" element={<VariantC {...commonProps} />} />
            <Route path="*" element={<Navigate to="/a" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
      <PrototypeSwitcher variants={[...VARIANTS]} current={location.pathname.slice(1)} onChange={changeVariant} />
    </div>
  );
}

export default App;
