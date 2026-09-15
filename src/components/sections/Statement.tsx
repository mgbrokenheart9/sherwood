import { MaskReveal } from "@/components/ui/MaskReveal";
import { Reveal } from "@/components/ui/Reveal";
import { STATEMENT } from "@/content/site";

export function Statement() {
  return (
    <section className="statement-sec container" id="mission">
      <div className="statement-head">
        <MaskReveal as="h2" className="statement">
          {STATEMENT.title}
        </MaskReveal>
        <Reveal delay={0.18}>
          <p className="lede">{STATEMENT.lede}</p>
        </Reveal>
      </div>
    </section>
  );
}
