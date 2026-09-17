import { ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { CodeBlock, CopyCommand } from "@/components/ui/CopyCommand";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { Reveal } from "@/components/ui/Reveal";
import { INSTALL_COMMAND, QUICK_START } from "@/content/site";

export function QuickStart() {
  return (
    <section className="quickstart section container" id="quick-start">
      <Reveal>
        <Eyebrow className="quickstart__eyebrow">{QUICK_START.eyebrow}</Eyebrow>
      </Reveal>
      <MaskReveal as="h2" className="display quickstart__title" delay={0.05}>
        {QUICK_START.title}
      </MaskReveal>

      <Reveal delay={0.1}>
        <div className="quickstart__code">
          <CopyCommand command={INSTALL_COMMAND} prompt="$" />
          <CodeBlock label={QUICK_START.usageLabel} code={QUICK_START.usage} />
        </div>
      </Reveal>

      <Reveal delay={0.14}>
        <div className="quickstart__actions">
          <Button magnetic variant="solid" href="#console" icon={<ArrowDown size={16} weight="bold" />} iconDir="down">
            Launch console
          </Button>
          <span className="metaline">{QUICK_START.meta}</span>
        </div>
      </Reveal>
    </section>
  );
}
