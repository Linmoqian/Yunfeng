/* 隔离的连接演示复用真实胶囊，计时器不影响应用服务与订阅。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from "react";
import { interactionStyles } from "../../components/common";
import { ConnectionCapsule } from "../../features/workbench/components/ConnectionCapsule";
import styles from "./InteractionSamples.module.css";

type Phase = "online" | "offline" | "reconnecting";
export function ConnectionSample() {
  const [phase, setPhase] = useState<Phase>("online");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clear() { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } }
  useEffect(() => clear, []);
  function change(next: Phase) { clear(); setPhase(next); }
  function reconnect() {
    change("reconnecting");
    timer.current = setTimeout(() => { timer.current = null; setPhase("online"); }, 5000);
  }
  return <>
    <div className={styles.actions}>
      <button type="button" className={interactionStyles.pressable} onClick={() => change("offline")}>模拟断线</button>
      <button type="button" className={interactionStyles.pressable} disabled={phase === "reconnecting"} onClick={reconnect}>重连</button>
      <button type="button" className={interactionStyles.pressable} disabled={phase === "online"} onClick={() => change("online")}>恢复</button>
    </div>
    <div className={styles.connectionStage} aria-label="连接演示区域">
      <span className={styles.connectionPhase}>{phase === "online" ? "连接正常" : phase === "offline" ? "已断线" : "重连中，稍后自动恢复"} · 样例</span>
      <ConnectionCapsule busy={phase === "reconnecting"} error={phase === "offline" ? "模拟断线，仅影响此样例。" : null} onRetry={reconnect} />
    </div>
  </>;
}
