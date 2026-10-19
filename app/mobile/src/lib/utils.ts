import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 Tailwind 类名：clsx 条件合并 + tailwind-merge 去重。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
