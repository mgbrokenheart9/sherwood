import { AgentConsole } from "@/components/console/AgentConsole";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { CONSOLE } from "@/content/site";

export function ConsoleSection() {
  return (
    <section className="console-sec" id="console">
      <div className="container console-sec__inner">
        <div className="console-sec__head">
          <div>
            <Reveal>
              <Eyebrow dot>{CONSOLE.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 className="statement console-sec__title">{CONSOLE.title}</h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="lede console-sec__lede">{CONSOLE.lede}</p>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <div className="console-sec__meta">
              {CONSOLE.meta[0]}
              <br />
              {CONSOLE.meta[1]}
            </div>
          </Reveal>
        </div>

        <Reveal y={30} amount={0.05}>
          <div className="console-sec__shot">
            <AgentConsole />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
