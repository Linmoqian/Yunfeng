// 变体共享的数据接口：三个 UI 变体复用同一套 hooks 数据，只改信息架构。
import type { UseSidecarResult } from "../../hooks/useSidecar";
import type { UseSessionsResult } from "../../hooks/useSessions";
import type { UseSessionResult } from "../../hooks/useSession";
import type { UseFileTreeResult } from "../../hooks/useFileTree";
import type { UseModelsResult } from "../../hooks/useModels";

export interface VariantProps {
  sidecar: UseSidecarResult;
  sessions: UseSessionsResult;
  session: UseSessionResult;
  fileTree: UseFileTreeResult;
  models: UseModelsResult;
  bannerError: string | null;
  dismissBannerError: () => void;
}

export const VARIANT_NAMES: Record<string, string> = {
  a: "命令面板 · 极简",
  b: "工程工作台 · dock",
  c: "沉浸对话 · 抽屉",
};
