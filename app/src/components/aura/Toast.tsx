// Aura toast 通知（底部居中，自动消失）。
interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-4 py-2 rounded-xl shadow-lg z-50 transition-opacity duration-300 pointer-events-none ${
        message ? "opacity-100" : "opacity-0"
      }`}
    >
      {message ?? ""}
    </div>
  );
}
