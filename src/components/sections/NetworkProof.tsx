"use client";

import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { useRuntimeState } from "@/components/console/runtime-provider";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { Reveal } from "@/components/ui/Reveal";
import { DEPLOYMENT, NETWORK_SWITCH, type DeploymentFact } from "@/content/deployment";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { cx } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

function useLiveBlock(): number | undefined {
  const network = useRuntimeState((snapshot) => snapshot.blockchain.networks.find((item) => item.id === ACTIVE_NETWORK.id));
  return network?.source === "rpc" ? network.blockNumber : undefined;
}

function Fact({ fact }: { fact: DeploymentFact }) {
  const liveBlock = useLiveBlock();
  const value = fact.live ? (liveBlock ? `#${formatNumber(liveBlock)}` : "Connecting…") : fact.value;

  return (
    <article className="fact">
      <span className="metaline">{fact.label}</span>
      <span className={cx("fact__value", fact.mono && "fact__value--mono")}>
        {fact.live && <span className={cx("status-dot", ACTIVE_NETWORK.testnet && "status-dot--test")} aria-hidden="true" />}
        {value}
      </span>
      <p className="fact__note">{fact.note}</p>
      {fact.href && (
        <a className="fact__link" href={fact.href} target="_blank" rel="noopener noreferrer">
          {fact.linkLabel ?? "View on explorer"}
          <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}

/** Verifiable facts about the network this build runs on, with a link to the sibling deployment. */
export function NetworkProof() {
  return (
    <section className="network-proof container" id="network">
      <Reveal>
        <Eyebrow dot className="network-proof__eyebrow">
          {DEPLOYMENT.eyebrow}
        </Eyebrow>
      </Reveal>

      <div className="statement-head network-proof__head">
        <MaskReveal as="h2" className="statement" delay={0.05}>
          {DEPLOYMENT.title}
        </MaskReveal>
        <Reveal delay={0.18}>
          <p className="lede">{DEPLOYMENT.lede}</p>
        </Reveal>
      </div>

      <div className="network-proof__grid">
        {DEPLOYMENT.facts.map((fact, index) => (
          <Reveal key={fact.label} delay={index * 0.06}>
            <Fact fact={fact} />
          </Reveal>
        ))}
      </div>

      {NETWORK_SWITCH.url && (
        <Reveal delay={0.2}>
          <div className="network-proof__switch">
            <Button variant="ghost" href={NETWORK_SWITCH.url} icon={<ArrowUpRight size={16} weight="bold" />} iconDir="upright">
              {NETWORK_SWITCH.cta}
            </Button>
            <span className="metaline">{NETWORK_SWITCH.note}</span>
          </div>
        </Reveal>
      )}
    </section>
  );
}
