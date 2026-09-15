"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cn";
import { EASE_OUT, useMotionPrefs } from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  amount?: number;
}

export function Reveal({ children, className, delay = 0, y = 20, amount = 0.25 }: RevealProps) {
  const { instant } = useMotionPrefs();

  return (
    <motion.div
      className={cx("reveal", className)}
      initial={{ opacity: 0, transform: `translateY(${y}px)` }}
      whileInView={{ opacity: 1, transform: "translateY(0px)" }}
      viewport={{ once: true, amount }}
      transition={instant ? { duration: 0 } : { duration: 0.55, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
