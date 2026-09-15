"use client";

import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { useRuntimeState } from "@/components/console/runtime-provider";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { Reveal } from "@/components/ui/Reveal";
import { DEPLOYMENT, IS_MAINNET, type DeploymentFact } from "@/content/deployment";
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
        {fact.live && <span className="status-dot" aria-hidden="true" />}
        {value}
      </span>
      <p className="fact__note">{fact.note}</p>
      {fact.href && (
        <a className="fact__link" href={fact.href} target="_blank" rel="noopener noreferrer">
          View on explorer
          <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}

/** Verifiable proof that Sherwood is live on Robinhood Chain mainnet. Hidden on testnet builds. */
export function MainnetProof() {
  if (!IS_MAINNET) return null;

  return (
    <section className="mainnet container" id="mainnet">
      <Reveal>
        <Eyebrow dot className="mainnet__eyebrow">
          {DEPLOYMENT.eyebrow}
        </Eyebrow>
      </Reveal>

      <div className="statement-head mainnet__head">
        <MaskReveal as="h2" className="statement" delay={0.05}>
          {DEPLOYMENT.title}
        </MaskReveal>
        <Reveal delay={0.18}>
          <p className="lede">{DEPLOYMENT.lede}</p>
        </Reveal>
      </div>

      <div className="mainnet__grid">
        {DEPLOYMENT.facts.map((fact, index) => (
          <Reveal key={fact.label} delay={index * 0.06}>
            <Fact fact={fact} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
