/* 独立组件路由：只组装所属组件，不启动主工作区的数据流。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { useParams } from "react-router-dom";
import { WorkspaceUtility } from "./WorkspaceUtility";
import { isSharedComponent } from "../services/componentSharing";
import { WorkspaceShell } from "./WorkspaceShell";
import { PaperWritingContext, usePaperWriting } from "../hooks/usePaperWriting";
import { PaperWriting } from "./PaperWriting";
import { PaperNavigation } from "./PaperNavigation";
import { PaperMaterials } from "./PaperMaterials";
import { RESEARCH_TOOLS } from "../research-tools/model";
function PaperWindow() {
  const paper = usePaperWriting();
  const metadata = RESEARCH_TOOLS.find((tool) => tool.id === paper.active)!;
  return <PaperWritingContext.Provider value={paper}><WorkspaceShell navigation={null} workbench={null} toolPanels={{ leftTitle: metadata.left, rightTitle: metadata.right, left: <PaperNavigation />, right: <PaperMaterials /> }}><PaperWriting independent /></WorkspaceShell></PaperWritingContext.Provider>;
}
export function ComponentWindow() {
  const { component = "" } = useParams();
  if (!isSharedComponent(component)) return <p role="alert">组件尚未接入共享</p>;
  if (component === "writing") return <PaperWindow />;
  return <WorkspaceUtility id={`tool-${component}`} title="资源" independent />;
}
