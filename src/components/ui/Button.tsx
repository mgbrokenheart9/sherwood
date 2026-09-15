"use client";

import { motion, useSpring, useTransform, useVelocity } from "motion/react";
import type { MouseEventHandler, PointerEvent, ReactNode } from "react";
import { isExternal } from "@/content/site";
import { cx } from "@/lib/cn";
import { SPRINGS, canHover, useMotionPrefs } from "@/lib/motion";

interface ButtonProps {
  children: ReactNode;
  href: string;
  variant?: "solid" | "ghost";
  onDark?: boolean;
  icon?: ReactNode;
  iconDir?: "down" | "upright";
  magnetic?: boolean;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function Button({
  children,
  href,
  variant = "solid",
  onDark = false,
  icon,
  iconDir = "down",
  magnetic = false,
  className,
  onClick,
}: ButtonProps) {
  const { instant } = useMotionPrefs();
  const x = useSpring(0, SPRINGS.surface);
  const y = useSpring(0, SPRINGS.surface);
  const press = useSpring(0, SPRINGS.press);
  const velocity = useVelocity(x);

  const scaleX = useTransform(() => 1 + Math.min(Math.abs(velocity.get()) / 9000, 0.018) + press.get() * 0.018);
  const scaleY = useTransform(() => 1 - Math.min(Math.abs(velocity.get()) / 18000, 0.009) - press.get() * 0.035);
  const contentX = useTransform(x, (value) => value * 0.4);
  const contentY = useTransform(y, (value) => value * 0.4);
  const contentScale = useTransform(press, [0, 1], [1, 0.98]);

  const release = () => {
    x.set(0);
    y.set(0);
    press.set(0);
  };

  const follow = (event: PointerEvent<HTMLAnchorElement>) => {
    if (instant || !magnetic || event.pointerType === "touch" || !canHover()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - rect.left) / rect.width - 0.5) * 10);
    y.set(((event.clientY - rect.top) / rect.height - 0.5) * 7);
  };

  const external = isExternal(href);

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={onClick}
      onPointerMove={follow}
      onPointerDown={() => !instant && press.set(1)}
      onPointerUp={() => press.set(0)}
      onPointerCancel={release}
      onPointerLeave={release}
      onBlur={release}
      className={cx("btn", `btn--${variant}`, onDark && "btn--on-dark", className)}
    >
      <motion.span className="btn__surface" aria-hidden="true" style={instant ? undefined : { x, y, scaleX, scaleY }} />
      <motion.span className="btn__content" style={instant ? undefined : { x: contentX, y: contentY, scale: contentScale }}>
        {children}
        {icon && (
          <span className={`btn__icon btn__icon--${iconDir}`} aria-hidden="true">
            <span className="btn__arrow">{icon}</span>
            <span className="btn__arrow btn__arrow--echo">{icon}</span>
          </span>
        )}
      </motion.span>
    </a>
  );
}
