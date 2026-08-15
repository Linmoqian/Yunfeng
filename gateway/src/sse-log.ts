// 从上游 SSE 字节流中提取事件类型，供网关输出关键日志。
// 仅解析日志所需字段；数据本身原样透传，解析失败不影响转发。

const KEY_EVENT_TYPES = new Set([
  "agent_start",
  "agent_end",
  "agent_settled",
  "message_completed",
  "tool_started",
  "tool_finished",
  "approval_requested",
  "approval_resolved",
  "run_failed",
  "run_settled",
  "task_snapshot",
  "task_updated",
]);

export interface SseEventSample {
  /** SSE data 中的 JSON type 字段；非 JSON 事件为 null。 */
  type: string | null;
}

export interface SseLogSummary {
  /** 完整事件帧总数。 */
  events: number;
  /** 被识别为关键事件的数量。 */
  keyEvents: number;
  /** 各类型出现次数。 */
  typeCounts: Record<string, number>;
}

/**
 * 按 SSE 帧边界（空行分隔）解析事件。
 * 上游分块可能把一帧切在任意位置，因此内部保留缓冲。
 */
export class SseEventParser {
  private buffer = "";
  private counts = new Map<string, number>();
  private total = 0;
  private keyTotal = 0;

  /** 喂入一段上游字节；返回本段中完整事件帧的样本。 */
  push(chunk: string): SseEventSample[] {
    this.buffer += chunk;
    const frames = this.buffer.split(/\n\n|\r\n\r\n/);
    this.buffer = frames.pop() ?? "";
    const samples: SseEventSample[] = [];
    for (const frame of frames) {
      const sample = this.parseFrame(frame);
      if (sample === null) continue;
      this.record(sample);
      samples.push(sample);
    }
    return samples;
  }

  /** 连接关闭时冲刷剩余缓冲并返回汇总。 */
  finish(): SseLogSummary {
    const tail = this.parseFrame(this.buffer);
    this.buffer = "";
    if (tail !== null) this.record(tail);
    return this.summary();
  }

  private parseFrame(frame: string): SseEventSample | null {
    const dataLines: string[] = [];
    for (const rawLine of frame.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return null;

    const payload = dataLines.join("\n");
    let type: string | null = null;
    try {
      const parsed = JSON.parse(payload) as { type?: unknown };
      if (typeof parsed.type === "string") type = parsed.type;
    } catch {
      // 非 JSON 帧（如首帧占位）不算错误，仅不参与类型统计。
    }
    return { type };
  }

  private record(sample: SseEventSample): void {
    this.total += 1;
    if (sample.type === null) return;
    this.counts.set(sample.type, (this.counts.get(sample.type) ?? 0) + 1);
    if (KEY_EVENT_TYPES.has(sample.type)) this.keyTotal += 1;
  }

  summary(): SseLogSummary {
    const typeCounts: Record<string, number> = {};
    for (const [type, count] of [...this.counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      typeCounts[type] = count;
    }
    return { events: this.total, keyEvents: this.keyTotal, typeCounts };
  }

  static isKeyEvent(type: string | null): boolean {
    return type !== null && KEY_EVENT_TYPES.has(type);
  }
}
