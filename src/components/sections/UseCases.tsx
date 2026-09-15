import type { Icon } from "@phosphor-icons/react";
import { Broadcast, ChartLineUp, CurrencyCircleDollar, Stack } from "@phosphor-icons/react/dist/ssr";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { Reveal } from "@/components/ui/Reveal";
import { USE_CASES, type UseCaseIcon } from "@/content/site";

const ICONS: Record<UseCaseIcon, Icon> = {
  trading: ChartLineUp,
  service: Broadcast,
  defi: Stack,
  payments: CurrencyCircleDollar,
};

export function UseCases() {
  return (
    <section className="usecases container" id="use-cases">
      <Reveal>
        <Eyebrow className="usecases__eyebrow">{USE_CASES.eyebrow}</Eyebrow>
      </Reveal>

      <div className="statement-head usecases__head">
        <MaskReveal as="h2" className="statement" delay={0.05}>
          {USE_CASES.title}
        </MaskReveal>
        <Reveal delay={0.18}>
          <p className="lede">{USE_CASES.lede}</p>
        </Reveal>
      </div>

      <div className="usecases__grid">
        {USE_CASES.items.map((item, index) => {
          const UseCaseMark = ICONS[item.icon];
          return (
            <Reveal key={item.title} delay={index * 0.06}>
              <article className="usecase">
                <div className="usecase__head">
                  <UseCaseMark size={24} />
                  <span className="metaline">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="subhead">{item.title}</h3>
                <p>{item.body}</p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
