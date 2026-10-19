/* 热重载恢复：只重试读取和监听注册；退出时取消等待并回收监听。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
export function recoveryDelay(attempt: number) { return Math.min(500 * 2 ** attempt, 5000); }
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  });
}
/** 只用于 GET；短暂网关和网络错误退避重试，权限和业务错误立即交给调用方。 */
export async function fetchRead(url: string, options: { signal?: AbortSignal } = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try {
      const response = await fetch(url, options);
      if (![502, 503, 504].includes(response.status) || (attempt >= 7 && !options.signal)) return response;
      await response.body?.cancel();
    } catch (error) {
      if (options.signal?.aborted || !(error instanceof TypeError) || (attempt >= 7 && !options.signal)) throw error;
    }
    await wait(recoveryDelay(attempt), options.signal);
  }
}
/** 立即返回清理函数；失败的监听注册在后台退避恢复，迟到的注册也会回收。 */
export async function recoverSubscription(register: () => Promise<() => void>): Promise<() => void> {
  const controller = new AbortController();
  let stop: (() => void) | undefined;
  void (async () => {
    for (let attempt = 0; !controller.signal.aborted; attempt++) {
      try {
        const unsubscribe = await register();
        if (controller.signal.aborted) unsubscribe(); else stop = unsubscribe;
        return;
      } catch {
        try { await wait(recoveryDelay(attempt), controller.signal); } catch { return; }
      }
    }
  })();
  return () => { controller.abort(); stop?.(); };
}
