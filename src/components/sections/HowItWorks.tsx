import { NetworkList } from "@/components/console/panels/BlockchainPanel";
import { CopyCommand } from "@/components/ui/CopyCommand";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { Reveal } from "@/components/ui/Reveal";
import { STEPS } from "@/content/site";
import { FeatureWindow } from "./Feature";

export function HowItWorks() {
  return (
    <section className="steps container" id="how-it-works">
      <div className="steps__grid">
        <div>
          <Reveal>
            <Eyebrow className="steps__eyebrow">{STEPS.eyebrow}</Eyebrow>
          </Reveal>
          <MaskReveal as="h2" className="statement steps__title" delay={0.05}>
            {STEPS.title}
          </MaskReveal>
          <Reveal delay={0.1} y={24}>
            <FeatureWindow title="sherwood · networks" tone="glade">
              <NetworkList />
            </FeatureWindow>
          </Reveal>
        </div>

        <div>
          <Reveal delay={0.08}>
            <p className="steps__intro">{STEPS.intro}</p>
          </Reveal>
          <div className="steps__list">
            {STEPS.items.map((step, index) => (
              <Reveal key={step.label} delay={0.04 + index * 0.05}>
                <div className="step">
                  <Eyebrow>{step.label}</Eyebrow>
                  <h3 className="subhead">{step.title}</h3>
                  <p>{step.body}</p>
                  {"code" in step && (
                    <div className="step__code">
                      <CopyCommand size="sm" copyable={false} command={step.code} />
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
