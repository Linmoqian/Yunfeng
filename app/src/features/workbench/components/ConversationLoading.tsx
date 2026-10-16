/* 会话只上报读取状态，保留已呈现内容，加载提示统一到工作区胶囊。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useWorkspaceLoading } from "./WorkspaceLoading";
export function ConversationLoading() {
  useWorkspaceLoading(true);
  return null;
}
