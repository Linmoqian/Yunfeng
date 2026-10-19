// 推送通知：Tauri 运行时走系统通知插件，浏览器预览走 Web Notification API。
// 当前为本地通知 + SSE 断线补发；真正的 APNs/FCM 远程推送依赖外部基础设施，暂未引入。

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { TaskState } from "./types";
import { isTauriRuntime } from "./platform";

const ENABLED_KEY = "yf-notifications-enabled";

export function loadNotificationsEnabled(storage: Storage = localStorage): boolean {
  return storage.getItem(ENABLED_KEY) === "1";
}

export function saveNotificationsEnabled(enabled: boolean, storage: Storage = localStorage): void {
  storage.setItem(ENABLED_KEY, enabled ? "1" : "0");
}

/** 浏览器 Web Notification 是否可用。 */
export function webNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

async function webPermission(): Promise<NotificationPermission> {
  if (!webNotificationSupported()) return "denied";
  return Notification.permission;
}

/** 请求系统通知权限：Tauri 走插件，浏览器走 Web Notification。 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      const permission = await requestPermission();
      return permission === "granted";
    } catch {
      return false;
    }
  }
  if (!webNotificationSupported()) return false;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

/** 当前是否已获得通知权限。 */
export async function notificationPermissionGranted(): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      return await isPermissionGranted();
    } catch {
      return false;
    }
  }
  return (await webPermission()) === "granted";
}

/** 发送一条本地通知；未开启或未授权时静默跳过。 */
export async function notify(title: string, body: string): Promise<boolean> {
  if (!loadNotificationsEnabled()) return false;
  try {
    if (!(await notificationPermissionGranted())) return false;
    if (isTauriRuntime()) {
      sendNotification({ title, body });
    } else if (webNotificationSupported()) {
      new Notification(title, { body });
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export interface TaskNotice {
  title: string;
  body: string;
}

/** 任务状态 → 通知文案；无感状态返回 null。 */
export function taskTransitionNotice(task: TaskState): TaskNotice | null {
  const title = task.title || "未命名任务";
  switch (task.status) {
    case "completed":
      return { title: "任务已完成", body: `${title} 已执行完成` };
    case "failed":
      return { title: "任务失败", body: `${title} 执行失败` };
    case "waiting_approval":
      return { title: "任务等待审批", body: `${title} 需要你的确认` };
    case "waiting_input":
      return { title: "任务等待输入", body: `${title} 需要你的输入` };
    default:
      return null;
  }
}
