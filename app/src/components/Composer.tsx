// 共享消息输入组件：三个变体共用（Enter 发送，Shift+Enter 换行，流式时切换为“停止”）。

interface ComposerProps {
  /** 变体前缀，决定 className（va-/vb-/vc-） */
  prefix: "va" | "vb" | "vc";
  disabled: boolean;
  isStreaming: boolean;
  placeholder: string;
  onSend: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
}

export function Composer({ prefix, disabled, isStreaming, placeholder, onSend, onAbort }: ComposerProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = e.currentTarget.elements.namedItem("msg") as HTMLTextAreaElement | null;
    if (!el) return;
    const text = el.value.trim();
    if (!text || disabled) return;
    el.value = "";
    void onSend(text);
  };

  return (
    <form className={`${prefix}-composer`} onSubmit={handleSubmit}>
      <textarea
        name="msg"
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {isStreaming ? (
        <button type="button" className={`${prefix}-send`} onClick={() => void onAbort()}>
          停止
        </button>
      ) : (
        <button type="submit" className={`${prefix}-send`} disabled={disabled}>
          发送
        </button>
      )}
    </form>
  );
}
