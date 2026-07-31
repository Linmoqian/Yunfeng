// 共享错误横幅：三个变体复用。

interface BannerProps {
  prefix: "va" | "vb" | "vc";
  message: string;
  onDismiss: () => void;
}

export function Banner({ prefix, message, onDismiss }: BannerProps) {
  return (
    <div className={`${prefix}-banner`}>
      {message}
      <button onClick={onDismiss}>✕</button>
    </div>
  );
}
