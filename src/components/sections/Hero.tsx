"use client";

import { ArrowDown, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { CSSProperties } from "react";
import { useBoot } from "@/components/boot/boot-context";
import { useRuntimeState } from "@/components/console/runtime-provider";
import { Button } from "@/components/ui/Button";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { IS_MAINNET, NETWORK_LABEL } from "@/content/deployment";
import { HERO, LINKS } from "@/content/site";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { formatNumber } from "@/lib/format";
import { Harness } from "./Harness";

const fadeDelay = (seconds: number) => ({ "--fade-delay": `${seconds}s` }) as CSSProperties;

/** "Live on Robinhood Chain mainnet" with the latest block read from RPC. */
function NetworkStatus() {
  const network = useRuntimeState((snapshot) => snapshot.blockchain.networks.find((item) => item.id === ACTIVE_NETWORK.id));
  const block = network?.source === "rpc" ? network.blockNumber : undefined;

  return (
    <a className="hero__status hero__fade" href="#mainnet" style={fadeDelay(0)}>
      <span className="status-dot" aria-hidden="true" />
      <span>Live on {NETWORK_LABEL}</span>
      {block ? <span className="hero__status-block">#{formatNumber(block)}</span> : null}
    </a>
  );
}

export function Hero() {
  const { ready } = useBoot();

  return (
    <section className="hero" id="top" data-ready={ready}>
      <div className="hero__inner container">
        <div className="hero__copy">
          {IS_MAINNET && <NetworkStatus />}

          <MaskReveal as="h1" className="display hero__title" trigger="load" delay={0.05} stagger={0.09} lines={HERO.lines} />

          <p className="lede hero__lede hero__fade" style={fadeDelay(0.34)}>
            {HERO.lede}
          </p>

          <div className="hero__actions hero__fade" style={fadeDelay(0.42)}>
            <Button magnetic variant="solid" href="#console" icon={<ArrowDown size={16} weight="bold" />} iconDir="down">
              Launch console
            </Button>
            <Button magnetic variant="ghost" href={LINKS.github} icon={<ArrowUpRight size={16} weight="bold" />} iconDir="upright">
              Star on GitHub
            </Button>
            <span className="metaline hero__platforms">{HERO.platforms}</span>
          </div>
        </div>

        <Harness />
      </div>
    </section>
  );
}
