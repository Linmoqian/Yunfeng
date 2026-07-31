// Aura 浮动输入条：附件 + 输入框 + 发送/停止。
import { Icons } from "../Icons";

interface ComposerProps {
  disabled: boolean;
  isStreaming: boolean;
  placeholder?: string;
  onSend: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
  onAttach: () => void;
}

export function Composer({
  disabled,
  isStreaming,
  placeholder = "向 Aura 发送指令...",
  onSend,
  onAbort,
  onAttach,
}: ComposerProps) {
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
    <div className="p-4 z-20">
      <form
        onSubmit={handleSubmit}
        className="max-w-3xl nes-container is-rounded is-dark mx-auto p-2 shadow-xl transition-all duration-200 focus-within:ring-2 focus-within:ring-indigo-500/10"
      >
        <div className="flex items-end space-x-2">
          <button
            type="button"
            onClick={onAttach}
            className="h-9 w-9 p-0 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0 pixel-press"
            title="附加上下文（选择项目目录）"
          >
            <Icons.Paperclip className="w-4 h-4" />
          </button>

          <textarea
            name="msg"
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-500 focus:outline-none resize-none py-2 leading-relaxed"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={() => void onAbort()}
              className="nes-btn is-error h-9 w-9 px-0 py-0 flex items-center justify-center shadow-md"
              title="停止生成"
            >
              <Icons.Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled}
              className="nes-btn is-primary m-0 h-9 w-9 px-0 py-0 flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              title="发送"
            >
              <Icons.ArrowUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
