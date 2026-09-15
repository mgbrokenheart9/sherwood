import type { ReactNode } from "react";
import { cx } from "@/lib/cn";

export function Eyebrow({ children, dot = false, className }: { children: ReactNode; dot?: boolean; className?: string }) {
  return <span className={cx("eyebrow", dot && "eyebrow--dot", className)}>{children}</span>;
}
