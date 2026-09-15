"use client";

import type { Icon } from "@phosphor-icons/react";
import { BracketsCurly, Database, Lightning, Robot, ShieldCheck, TreeStructure } from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import { useState } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { MODULES, type ModuleIcon } from "@/content/site";
import { SPRINGS, canHover, useMotionPrefs } from "@/lib/motion";

const ICONS: Record<ModuleIcon, Icon> = {
  contexts: TreeStructure,
  memory: Database,
  actions: BracketsCurly,
  agents: Robot,
  privacy: ShieldCheck,
  payments: Lightning,
};

export function Modules() {
  const { instant } = useMotionPrefs();
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section className="modules container" id="modules">
      <Reveal>
        <Eyebrow className="modules__eyebrow">Six contexts · One composable runtime</Eyebrow>
      </Reveal>
      <Reveal delay={0.05}>
        <div className="modules__row" onPointerLeave={() => setHovered(null)}>
          {MODULES.map((module, index) => {
            const ModuleMark = ICONS[module.icon];
            const lifted = !instant && hovered === index;
            return (
              <span
                key={module.name}
                className="module-item"
                title={module.description}
                onPointerEnter={(event) => event.pointerType !== "touch" && canHover() && setHovered(index)}
              >
                <motion.span
                  className="module-item__mark"
                  initial={false}
                  animate={{ y: lifted ? -5 : 0, rotate: lifted ? -7 : 0, scale: lifted ? 1.16 : 1 }}
                  transition={instant ? { duration: 0 } : { type: "spring", ...SPRINGS.surface }}
                >
                  <ModuleMark size={22} weight={module.icon === "privacy" ? "fill" : "regular"} className={module.icon === "privacy" ? "accent" : undefined} />
                </motion.span>
                <span>{module.name}</span>
              </span>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
