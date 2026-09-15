import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { AppWindow, Stage } from "@/components/ui/AppWindow";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { Reveal } from "@/components/ui/Reveal";
import { Tilt } from "@/components/ui/Tilt";
import type { FeatureCopy } from "@/content/site";
import { cx } from "@/lib/cn";

export function FeatureWindow({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "canopy" | "deep" | "glade";
  children: ReactNode;
}) {
  return (
    <Stage tone={tone}>
      <AppWindow title={title} className="app--panel">
        <div className="app__scroll">{children}</div>
      </AppWindow>
    </Stage>
  );
}

export function Feature({ feature, media, id }: { feature: FeatureCopy; media: ReactNode; id?: string }) {
  return (
    <section className={cx("feature", feature.reverse && "feature--reverse")} id={id}>
      <div className="container feature__grid">
        <div className="feature__text">
          <Reveal>
            <Eyebrow className="feature__eyebrow">{`${feature.n} · ${feature.kicker}`}</Eyebrow>
          </Reveal>
          <MaskReveal as="h2" className="headline feature__title" delay={0.05}>
            {feature.title}
          </MaskReveal>
          <Reveal delay={0.1}>
            <p className="lede feature__lede">{feature.body}</p>
          </Reveal>
          <ul className="flist">
            {feature.points.map((point, index) => (
              <li key={point}>
                <Reveal className="flist__content" delay={index * 0.04} y={8}>
                  {point}
                  <ArrowRight className="flist__arrow" size={14} weight="bold" />
                </Reveal>
              </li>
            ))}
          </ul>
        </div>

        <div className={cx("feature__media", feature.portrait && "feature__media--portrait")}>
          <Reveal delay={0.06} y={26} amount={0.1}>
            <Tilt max={1.5}>{media}</Tilt>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
