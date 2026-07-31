import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";

interface ComposerProps {
  disabled: boolean;
  isStreaming: boolean;
  onSend: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
  onAttach: () => void;
}

/** 浮动输入条：附件 + 自增高 textarea + 发送/停止。 */
export function Composer({ disabled, isStreaming, onSend, onAbort, onAttach }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const el = ref.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text || disabled) return;
    el.value = "";
    el.style.height = "auto";
    void onSend(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoSize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <button
          type="button"
          className="composer-attach"
          title="附加上下文（选择项目目录）"
          onClick={onAttach}
        >
          <Paperclip size={16} />
        </button>
        <textarea
          ref={ref}
          rows={1}
          placeholder="向 Pi 发送指令…"
          disabled={disabled}
          onKeyDown={onKeyDown}
          onInput={(e) => autoSize(e.currentTarget)}
        />
        {isStreaming ? (
          <button
            type="button"
            className="composer-button is-danger"
            title="停止生成"
            onClick={() => void onAbort()}
          >
            <Square size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="composer-button"
            title="发送"
            disabled={disabled}
            onClick={submit}
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
