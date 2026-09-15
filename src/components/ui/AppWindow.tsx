import type { ReactNode } from "react";
import { cx } from "@/lib/cn";

export function Stage({
  tone = "canopy",
  className,
  children,
}: {
  tone?: "canopy" | "deep" | "glade";
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx("stage", tone !== "canopy" && `stage--${tone}`, className)}>{children}</div>;
}

export function AppWindow({
  title,
  actions,
  className,
  children,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("app", className)}>
      <div className="app__bar">
        <div className="app__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span className="app__title">{title}</span>
        {actions && <div className="app__bar-end">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
