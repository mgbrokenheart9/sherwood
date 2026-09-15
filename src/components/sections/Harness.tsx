"use client";

import {
  ChartLineUp,
  Cube,
  CurrencyCircleDollar,
  LockKey,
  ShareNetwork,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { motion, useInView, useMotionTemplate, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { BRAND_BOX, BRAND_PATH } from "@/components/brand/BrandMark";
import { useBoot } from "@/components/boot/boot-context";
import { HERO } from "@/content/site";
import { SPRINGS, canHover, useMotionPrefs } from "@/lib/motion";

const CAPABILITY_ICONS: { icon: Icon; label: string; color?: string }[] = [
  { icon: ShieldCheck, label: "ZK proof generation", color: "#1f7a4c" },
  { icon: CurrencyCircleDollar, label: "Payment processing" },
  { icon: Cube, label: "Contract interaction" },
  { icon: LockKey, label: "Private data analysis" },
  { icon: ShareNetwork, label: "Multi-party computation" },
  { icon: ChartLineUp, label: "Autonomous trading" },
];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// The tree is tall and narrow; 1.4× gives it the same presence as the orbiting drops. Centred on its box.
const LOGO_ORIGIN = `scale(1.4) translate(${-BRAND_BOX.width / 2}px, ${-BRAND_BOX.height / 2}px)`;

type Timers = RefObject<ReturnType<typeof setTimeout>[]>;

function clearTimers(timers: Timers): void {
  timers.current.forEach(clearTimeout);
  timers.current = [];
}

export function Harness() {
  const { instant } = useMotionPrefs();
  const { ready } = useBoot();
  const [active, setActive] = useState(false);

  const stageRef = useRef<HTMLButtonElement>(null);
  const interacted = useRef(false);
  const introPlayed = useRef(false);
  const touchId = useRef<number | null>(null);
  const touchStart = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const inView = useInView(stageRef, { once: true, amount: 0.6 });
  const filterId = `harness-goo-${useId().replace(/[^\w-]/g, "")}`;

  const progress = useSpring(0, SPRINGS.heavy);
  const wobble = useSpring(progress, { stiffness: 240, damping: 22, mass: 0.9 });
  const shiftX = useSpring(0, SPRINGS.heavy);
  const shiftY = useSpring(0, SPRINGS.heavy);

  const scaleX = useTransform(wobble, (e) => 0.92 + e * 0.426 + Math.sin(clamp01(e) * Math.PI) * 0.054);
  const scaleY = useTransform(wobble, (e) => 0.92 + e * 0.426 - Math.sin(clamp01(e) * Math.PI) * 0.036);
  const logoTransform = useMotionTemplate`translate(180px, 159px) scale(${scaleX}, ${scaleY}) ${LOGO_ORIGIN}`;
  const blur = useTransform(progress, [0, 0.3, 0.72, 1], [0.5, 8, 8, 0.5]);
  const orbitOpacity = useTransform(progress, [0, 1], [1, 0.35]);

  const toggle = (next: boolean) => {
    interacted.current = true;
    clearTimers(timers);
    setActive(next);
  };

  useEffect(() => {
    const target = active ? 1 : 0;
    if (instant) {
      progress.jump(target);
      wobble.jump(target);
      shiftX.jump(0);
      shiftY.jump(0);
    } else {
      progress.set(target);
    }
  }, [active, instant, progress, wobble, shiftX, shiftY]);

  // Play a short merge once the figure is first seen, unless the user got there first.
  useEffect(() => {
    if (!inView || !ready || instant || interacted.current || introPlayed.current) return;
    timers.current.push(
      setTimeout(() => {
        if (document.hidden || interacted.current) return;
        introPlayed.current = true;
        setActive(true);
        timers.current.push(setTimeout(() => setActive(false), 1350));
      }, 1000),
    );
    return () => clearTimers(timers);
  }, [inView, ready, instant]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      clearTimers(timers);
      touchId.current = null;
      setActive(false);
      [progress, wobble, shiftX, shiftY].forEach((value) => value.jump(0));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimers(timers);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [progress, wobble, shiftX, shiftY]);

  return (
    <figure className="harness">
      <button
        ref={stageRef}
        className="harness__stage"
        type="button"
        aria-label="Explore six agent capabilities inside Sherwood"
        aria-pressed={active}
        onPointerEnter={(event) => event.pointerType === "mouse" && canHover() && toggle(true)}
        onPointerMove={(event) => {
          if (instant || event.pointerType !== "mouse" || !canHover()) return;
          const rect = event.currentTarget.getBoundingClientRect();
          shiftX.set(((event.clientX - rect.left) / rect.width - 0.5) * 12);
          shiftY.set(((event.clientY - rect.top) / rect.height - 0.5) * 8);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") toggle(false);
          shiftX.set(0);
          shiftY.set(0);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" || touchId.current !== null || !event.isPrimary) return;
          touchId.current = event.pointerId;
          touchStart.current = performance.now();
          event.currentTarget.setPointerCapture(event.pointerId);
          toggle(true);
        }}
        onPointerUp={(event) => {
          if (event.pointerId !== touchId.current) return;
          touchId.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          const hold = instant ? 0 : Math.max(0, 700 - (performance.now() - touchStart.current));
          timers.current.push(setTimeout(() => setActive(false), hold));
        }}
        onPointerCancel={(event) => {
          if (event.pointerId !== touchId.current) return;
          touchId.current = null;
          toggle(false);
        }}
        onClick={(event) => {
          // Keyboard activation reports detail === 0.
          if (event.detail === 0) toggle(!active);
        }}
        onKeyDown={(event) => event.key === "Escape" && toggle(false)}
        onBlur={() => toggle(false)}
      >
        <motion.span className="harness__orbit" style={{ opacity: orbitOpacity }} aria-hidden="true" />

        <motion.svg
          className="harness__scene"
          viewBox="0 0 360 318"
          aria-hidden="true"
          focusable="false"
          style={instant ? undefined : { x: shiftX, y: shiftY }}
        >
          <defs>
            <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
              <motion.feGaussianBlur in="SourceGraphic" stdDeviation={instant ? 0 : blur} result="soft" />
              <feColorMatrix in="soft" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>
          </defs>

          <g filter={`url(#${filterId})`} fill="#dcebd8">
            {CAPABILITY_ICONS.map((item, index) => (
              <Drop key={item.label} index={index} progress={progress} surface />
            ))}
            <motion.g style={{ transform: logoTransform, originX: 0, originY: 0, transformBox: "view-box" }}>
              <path fillRule="evenodd" d={BRAND_PATH} />
            </motion.g>
          </g>

          {CAPABILITY_ICONS.map((item, index) => (
            <Drop key={item.label} index={index} progress={progress} />
          ))}
        </motion.svg>
      </button>

      <figcaption className="harness__caption">
        <span className="metaline">{HERO.caption}</span>
      </figcaption>
    </figure>
  );
}

function Drop({ index, progress, surface = false }: { index: number; progress: MotionValue<number>; surface?: boolean }) {
  const angle = ((index * 60 - 90) * Math.PI) / 180;
  const lag = (index % 3) * 0.025;

  const local = useTransform(progress, (t) => (t <= 0 ? t : Math.max(0, (t - lag) / (1 - lag))));
  const x = useTransform(local, (e) => 180 + Math.cos(angle) * 120 * (1 - e) - Math.sin(angle) * Math.sin(clamp01(e) * Math.PI) * 12);
  const y = useTransform(local, (e) => 159 + Math.sin(angle) * 120 * (1 - e) + Math.cos(angle) * Math.sin(clamp01(e) * Math.PI) * 12);
  const radius = useTransform(local, [0, 0.4, 1], [26, 24, 5]);
  const opacity = useTransform(local, [0, 0.35, 0.78, 1], [1, 1, 0, 0]);
  const scale = useTransform(local, [0, 1], [1, 0.65]);
  const dropTransform = useMotionTemplate`translate(${x}px, ${y}px)`;
  const markTransform = useMotionTemplate`translate(${x}px, ${y}px) scale(${scale})`;

  if (surface) {
    return (
      <motion.g style={{ transform: dropTransform, originX: 0, originY: 0, transformBox: "view-box" }}>
        <motion.circle r={radius} />
      </motion.g>
    );
  }

  const { icon: CapabilityIcon, color } = CAPABILITY_ICONS[index];
  return (
    <motion.g style={{ transform: markTransform, opacity, originX: 0, originY: 0, transformBox: "view-box" }}>
      <foreignObject x={-26} y={-26} width={52} height={52}>
        <div className="harness__agent" style={color ? { color } : undefined}>
          <CapabilityIcon size={23} weight="bold" />
        </div>
      </foreignObject>
    </motion.g>
  );
}
