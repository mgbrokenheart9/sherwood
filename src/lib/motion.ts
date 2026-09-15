"use client";

import { useReducedMotion } from "motion/react";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_SWIFT = [0.32, 0.72, 0, 1] as const;

export const SPRINGS = {
  press: { stiffness: 480, damping: 25, mass: 0.65 },
  surface: { stiffness: 280, damping: 19, mass: 0.85 },
  heavy: { stiffness: 180, damping: 19, mass: 1.2 },
} as const;

/** `instant` disables decorative motion for users who prefer reduced motion. */
export function useMotionPrefs(): { reduced: boolean; instant: boolean } {
  const reduced = useReducedMotion() ?? false;
  return { reduced, instant: reduced };
}

export function canHover(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
