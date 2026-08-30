import mapleMarkImage from "@/assets/maple-mark.png";

interface MapleMarkProps {
  /** 视觉尺寸（px），默认 22，与桌面端消息行标记一致。 */
  size?: number;
  className?: string;
}

/** 枫叶品牌标记：唯一的品牌性图形，仅承载品牌与状态语义，不作装饰纹样。 */
export function MapleMark({ size = 22, className = "" }: MapleMarkProps) {
  return (
    <img
      aria-hidden="true"
      className={`maple-mark ${className}`.trim()}
      src={mapleMarkImage}
      alt=""
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}
