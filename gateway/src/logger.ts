// 网关关键日志：统一 `[gateway]` 前缀 + ISO 时间 + 级别，便于检索与归档。
// 每行一条记录，字段为 key=value；不输出颜色，token 绝不进入请求日志。

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(
  write: (line: string) => void = (line) => {
    console.log(line);
  },
  now: () => Date = () => new Date(),
): Logger {
  const log = (level: LogLevel, message: string): void => {
    write(`[gateway] ${now().toISOString()} [${level}] ${message}`);
  };
  return {
    info: (message) => log("info", message),
    warn: (message) => log("warn", message),
    error: (message) => log("error", message),
  };
}

/** 测试与库内使用：丢弃日志。 */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
