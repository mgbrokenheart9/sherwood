"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import { useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { canHover, useMotionPrefs } from "@/lib/motion";

const TILT_SPRING = { stiffness: 150, damping: 15, mass: 0.4 };

interface TiltProps {
  children: ReactNode;
  className?: string;
  /** Maximum rotation in degrees. Keep it small for interactive content. */
  max?: number;
}

/** 3D tilt with a soft glare. Rotation pauses while focus is inside (e.g. typing). */
export function Tilt({ children, className, max = 5 }: TiltProps) {
  const { instant } = useMotionPrefs();
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(pointerY, [0, 1], [max, -max]), TILT_SPRING);
  const rotateY = useSpring(useTransform(pointerX, [0, 1], [-max, max]), TILT_SPRING);
  const glareX = useTransform(pointerX, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(pointerY, [0, 1], ["0%", "100%"]);
  const glare = useSpring(0, { stiffness: 120, damping: 20 });
  const glareImage = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.85), transparent 42%)`;

  const reset = () => {
    pointerX.set(0.5);
    pointerY.set(0.5);
    glare.set(0);
  };

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    if (instant || focused || !canHover() || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width);
    pointerY.set((event.clientY - rect.top) / rect.height);
    glare.set(0.16);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ perspective: 1100 }}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      onFocusCapture={() => {
        setFocused(true);
        reset();
      }}
      onBlurCapture={handleBlur}
    >
      <motion.div
        style={{
          position: "relative",
          rotateX: instant ? 0 : rotateX,
          rotateY: instant ? 0 : rotateY,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
        <motion.span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--radius)",
            pointerEvents: "none",
            mixBlendMode: "soft-light",
            opacity: instant ? 0 : glare,
            backgroundImage: glareImage,
          }}
        />
      </motion.div>
    </div>
  );
}
