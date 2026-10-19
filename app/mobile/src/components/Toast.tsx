interface ToastProps {
  message: string | null;
}

/** 轻量提示条：仅在 message 非空时渲染。显隐由父组件用 setTimeout 控制。 */
export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
