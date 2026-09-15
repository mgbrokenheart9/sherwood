"use client";

import { motion, useInView } from "motion/react";
import { useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import { useBoot } from "@/components/boot/boot-context";
import { EASE_OUT, useMotionPrefs } from "@/lib/motion";

interface MaskRevealProps {
  as?: "div" | "h1" | "h2" | "p";
  className?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
  /** "load" plays once the boot sequence is done, "view" when scrolled into view. */
  trigger?: "view" | "load";
  lines?: readonly string[];
  children?: ReactNode;
}

const MASK: CSSProperties = {
  display: "block",
  overflow: "hidden",
  paddingTop: "0.15em",
  paddingBottom: "0.22em",
  marginTop: "-0.15em",
  marginBottom: "-0.22em",
};

export function MaskReveal({
  as = "div",
  className,
  delay = 0,
  stagger = 0.09,
  duration = 0.85,
  trigger = "view",
  lines,
  children,
}: MaskRevealProps) {
  const Component = as as ElementType;
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const { ready } = useBoot();
  const { instant } = useMotionPrefs();
  const visible = trigger === "load" ? ready : inView;

  return (
    <Component ref={ref} className={className}>
      {(lines ?? [children]).map((line, index) => (
        <span key={index} style={MASK}>
          <motion.span
            className="mask-reveal__line"
            style={{ display: "block", willChange: "transform" }}
            initial={{ y: "135%" }}
            animate={{ y: visible ? "0%" : "135%" }}
            transition={instant ? { duration: 0 } : { duration, delay: delay + index * stagger, ease: EASE_OUT }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Component>
  );
}
