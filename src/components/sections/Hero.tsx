"use client";

import { ArrowDown, ArrowUpRight, Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { useState, type CSSProperties } from "react";
import { useBoot } from "@/components/boot/boot-context";
import { useRuntimeState } from "@/components/console/runtime-provider";
import { Button } from "@/components/ui/Button";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { IS_MAINNET, NETWORK_LABEL } from "@/content/deployment";
import { HERO, INSTALL_COMMAND, LINKS } from "@/content/site";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { cx } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { Harness } from "./Harness";

const HERO_PLATFORMS = [
  `${NETWORK_LABEL}`,
  "x402 Protocol",
  "USDG Settlement",
  "Zero-Knowledge Proofs",
] as const;

const fadeDelay = (seconds: number) => ({ "--fade-delay": `${seconds}s` }) as CSSProperties;

const VIDEO_BG_URL = "https://cdn.sceneai.art/Hero%20Section%20Video/0519be39-d8d1-48a5-84ee-f8a1ec038cd6.mp4";

/** Full-coverage background video with cinematic overlay. */
function HeroBackgroundVideo() {
  return (
    <div className="hero__video-container" aria-hidden="true">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="hero__video"
      >
        <source src={VIDEO_BG_URL} type="video/mp4" />
      </video>
      <div className="hero__video-overlay" />
    </div>
  );
}

/** Network status with the latest block read from RPC: green on mainnet, amber on testnet. */
function NetworkStatus() {
  const network = useRuntimeState((snapshot) => snapshot.blockchain.networks.find((item) => item.id === ACTIVE_NETWORK.id));
  const block = network?.source === "rpc" ? network.blockNumber : undefined;

  return (
    <a className="hero__status" href="#network">
      <span className={cx("status-dot", !IS_MAINNET && "status-dot--test")} aria-hidden="true" />
      <span>{IS_MAINNET ? `Live on ${NETWORK_LABEL}` : `${NETWORK_LABEL} · testnet`}</span>
      {block ? <span className="hero__status-block">#{formatNumber(block)}</span> : null}
    </a>
  );
}

/** Quick install terminal chip with one-click copy feedback. */
function QuickInstallChip() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
    }
  };

  return (
    <button
      type="button"
      className="hero__install-chip"
      onClick={handleCopy}
      title="Copy installation command"
      aria-label={`Copy installation command: ${INSTALL_COMMAND}`}
    >
      <span className="hero__install-prompt" aria-hidden="true">$</span>
      <code className="hero__install-code">{INSTALL_COMMAND}</code>
      <span className="hero__install-icon" aria-hidden="true">
        {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
      </span>
      {copied && <span className="hero__install-toast">Copied!</span>}
    </button>
  );
}

export function Hero() {
  const { ready } = useBoot();

  return (
    <section className="hero" id="top" data-ready={ready}>
      <HeroBackgroundVideo />
      <div className="hero__bottom-fade" aria-hidden="true" />

      <div className="hero__inner container">
        <div className="hero__narrative">
          <div className="hero__topbar hero__fade" style={fadeDelay(0)}>
            <NetworkStatus />
          </div>

          <MaskReveal
            as="h1"
            className="display hero__title"
            trigger="load"
            delay={0.05}
            stagger={0.09}
            lines={HERO.lines}
          />

          <p className="lede hero__lede hero__fade" style={fadeDelay(0.24)}>
            {HERO.lede}
          </p>

          <div className="hero__actions hero__fade" style={fadeDelay(0.32)}>
            <Button magnetic variant="solid" href="#console" icon={<ArrowDown size={16} weight="bold" />} iconDir="down">
              Launch console
            </Button>
            <Button magnetic variant="ghost" href={LINKS.github} icon={<ArrowUpRight size={16} weight="bold" />} iconDir="upright">
              Star on GitHub
            </Button>
            <QuickInstallChip />
          </div>

          <div className="hero__platforms hero__fade" style={fadeDelay(0.38)}>
            {HERO_PLATFORMS.map((platform) => (
              <span key={platform} className="hero__platform-chip">
                <span className="hero__platform-dot" aria-hidden="true" />
                {platform}
              </span>
            ))}
          </div>
        </div>

        <div className="hero__console hero__fade" style={fadeDelay(0.42)}>
          <div className="hero__glass-deck">
            <div className="hero__deck-header">
              <div className="hero__deck-dots" aria-hidden="true">
                <span className="hero__deck-dot hero__deck-dot--red" />
                <span className="hero__deck-dot hero__deck-dot--yellow" />
                <span className="hero__deck-dot hero__deck-dot--green" />
              </div>
              <span className="hero__deck-title">sherwood-runtime // capabilities</span>
              <span className="hero__deck-badge">
                <span className="status-dot status-dot--mini" aria-hidden="true" />
                <span>ONLINE</span>
              </span>
            </div>

            <div className="hero__deck-body">
              <Harness />
            </div>

            <div className="hero__deck-footer">
              <span className="hero__deck-pill">Groth16 ZK</span>
              <span className="hero__deck-pill">x402 Micropay</span>
              <span className="hero__deck-pill">Robinhood Chain</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hero__cue-wrap container hero__fade" style={fadeDelay(0.48)}>
        <a href="#architecture-demo" className="hero__scroll-cue" aria-label="Scroll to architecture terminal demo">
          <span className="hero__scroll-dot" />
          <span>Architecture terminal demo</span>
          <ArrowDown size={13} weight="bold" />
        </a>
      </div>
    </section>
  );
}
