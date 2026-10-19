/* LianAgent 两栏设置窗口，沿用 Yunfeng 主题与模型配置入口。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { Button, Input, Modal, Segmented, Select, Tag } from "antd";
import { Bot, BookOpenText, Database, Palette, PanelsTopLeft, Puzzle, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { ModelOption, ModelSelection } from "../../../services/taskService";
import type { ThemeMode } from "../../../theme/ThemeProvider";
import type { ConnectionState } from "../../../store/workbenchSlice";
import { SESSION_ENTER } from "../workspaceMotion";
import styles from "./WorkspaceSettings.module.css";

export interface WorkspaceSettingsProps {
  open: boolean; onClose: () => void; themeMode: ThemeMode; onThemeChange: (theme: ThemeMode) => void;
  modelSelection: ModelSelection | null; modelOptions: ModelOption[]; modelLoading: boolean; modelError: string | null;
  onModelChange: (model: ModelSelection | null) => void; onRetryModels: () => void; connectionState: ConnectionState;
}
const SECTIONS = [
  { id: "appearance", label: "外观", hint: "主题与阅读密度", icon: Palette },
  { id: "model", label: "模型", hint: "新会话默认模型", icon: Bot },
  { id: "workbench", label: "工作台", hint: "分栏与布局", icon: PanelsTopLeft },
  { id: "mode", label: "工作模式", hint: "专注与开发", icon: SlidersHorizontal },
  { id: "plugins", label: "插件", hint: "工具与扩展入口", icon: Puzzle },
  { id: "storage", label: "数据与存储", hint: "会话与连接", icon: Database },
  { id: "guide", label: "使用指南", hint: "工作区与快捷键", icon: BookOpenText },
  { id: "about", label: "关于", hint: "云枫 Yunfeng", icon: UserRound },
];
export function WorkspaceSettings(props: WorkspaceSettingsProps) {
  const [active, setActive] = useState("appearance");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState(() => localStorage.getItem("yunfeng.work-mode") ?? "开发");
  const [density, setDensity] = useState(() => localStorage.getItem("yunfeng.density") ?? "舒适");
  const reduced = useReducedMotion();
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  const matching = SECTIONS.filter((section) => `${section.label}${section.hint}`.includes(query.trim()));
  const section = SECTIONS.find((item) => item.id === active)!;
  return <Modal open={props.open} onCancel={() => { if (query) setQuery(""); else props.onClose(); }} footer={null} centered width={880}
    title={<div className={styles.heading}><strong>设置</strong><span>调整 Yunfeng 的工作方式</span></div>} className={styles.modal}>
    <div className={styles.layout}>
      <aside className={styles.nav} aria-label="设置分类"><div className={styles.search}><Search size={15} /><Input variant="borderless" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置" aria-label="搜索设置" allowClear /></div>
        <div className={styles.navItems} role="tablist" aria-label="设置页面">{matching.map((item) => <button key={item.id} type="button" role="tab" aria-selected={active === item.id} className={styles.navButton} onClick={() => { setActive(item.id); setQuery(""); }}><item.icon size={17} /><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}</div><small>云枫 Yunfeng</small>
      </aside>
      <motion.section key={active} role="tabpanel" aria-label={section.label} className={styles.content} initial={reduced ? false : { opacity: 0, transform: "translateY(4px)" }} animate={{ opacity: 1, transform: "translateY(0)" }} transition={SESSION_ENTER}>
        <h2>{section.label}</h2><p>{section.hint}</p>{!matching.length && query && <p role="status">没有匹配的设置。</p>}
        {active === "appearance" && <><h3>界面主题</h3><div className={styles.choices}>{([{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }, { value: "system", label: "跟随系统" }] as const).map((option) => <button type="button" key={option.value} aria-pressed={props.themeMode === option.value} onClick={() => props.onThemeChange(option.value)}><span className={styles.themePreview} data-theme={option.value}><i /><i /><i /></span><strong>{option.label}</strong></button>)}</div><h3>界面密度</h3><Segmented options={["舒适", "紧凑"]} value={density} onChange={(value) => { setDensity(String(value)); localStorage.setItem("yunfeng.density", String(value)); document.documentElement.dataset.density = String(value); }} /></>}
        {active === "model" && <><h3>新会话默认模型</h3>{props.modelError && <p role="alert">{props.modelError}</p>}<Select className={styles.select} loading={props.modelLoading} aria-label="默认模型" placeholder="跟随服务器默认" allowClear value={props.modelSelection ? `${props.modelSelection.provider}:${props.modelSelection.modelId}` : undefined}
          options={props.modelOptions.map((model) => ({ value: `${model.provider}:${model.id}`, label: `${model.provider} · ${model.name || model.id}` }))}
          onChange={(value: string | undefined) => { if (!value) { props.onModelChange(null); return; } const index = value.indexOf(":"); props.onModelChange({ provider: value.slice(0, index), modelId: value.slice(index + 1) }); }} /><Button onClick={props.onRetryModels}>重新读取模型</Button><p>模型凭据由现有服务端管理。</p></>}
        {active === "workbench" && <><h3>三栏布局</h3><p>拖动分栏边界调整宽度，双击恢复默认。侧栏支持图标模式，拖动标题或使用互换按钮改变停靠方向。</p><Button onClick={() => window.dispatchEvent(new Event("yunfeng-reset-layout"))}>重置分栏布局</Button></>}
        {active === "mode" && <><h3>工作模式偏好</h3><Segmented value={mode} options={["专注", "开发"]} onChange={(value) => { setMode(String(value)); localStorage.setItem("yunfeng.work-mode", String(value)); }} /><p>此偏好保存在界面中，既有 Agent 配置不受影响。</p></>}
        {active === "plugins" && <><h3>工作台扩展</h3><p>从右侧工作台的“添加或管理工具”进入拓展中心，添加、收起或移除工具卡片。</p><p>原生文稿支持本机保存、图片和 PDF 导出；设备配对尚未接入。</p></>}
        {active === "storage" && <><h3>服务连接</h3><Tag color={props.connectionState === "connected" ? "success" : "warning"}>{props.connectionState === "connected" ? "已连接" : props.connectionState === "connecting" ? "正在连接" : "离线"}</Tag><h3>会话数据</h3><p>对话由 Yunfeng 服务持久化。关闭标签仅关闭界面，可从左侧再次打开。</p><h3>布局偏好</h3><p>分栏宽度、主题和界面密度保存在本机浏览器中。</p></>}
        {active === "guide" && <><h3>标签与分栏</h3><p>点击加号新建会话；右键标签可重命名、分组或关闭。拖动标签排序，按住 Option / Alt 拖动合并为分组。</p><h3>快捷键</h3><dl><dt>⌘ / Ctrl + T</dt><dd>新建标签</dd><dt>⌘ / Ctrl + W</dt><dd>关闭当前标签</dd><dt>⌘ / Ctrl + Shift + T</dt><dd>重新打开关闭的标签</dd><dt>左右方向键</dt><dd>导航标签或调整分栏</dd></dl></>}
        {active === "about" && <><h3>云枫 Yunfeng</h3><p>云中之枫，匿于云中，而飒于林。</p><p>UI 结构与交互迁移自 LianAgent，配色沿用 Yunfeng Design Token。</p><p>Pi Agent 1.2.0</p></>}
      </motion.section>
    </div>
  </Modal>;
}
