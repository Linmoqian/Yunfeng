import mapleMarkImage from "@yunfeng/ui/assets/maple-mark.png";

interface MapleStatusMarkProps {
  attention?: boolean;
  className?: string;
}

export function MapleStatusMark({ attention = false, className = "" }: MapleStatusMarkProps) {
  return (
    <img
      aria-hidden="true"
      className={`maple-mark ${attention ? "maple-mark--attention" : ""} ${className}`.trim()}
      src={mapleMarkImage}
      alt=""
      draggable="false"
    />
  );
}
