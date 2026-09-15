import { BootProvider } from "@/components/boot/boot-context";
import { BootScreen } from "@/components/boot/BootScreen";
import { AgentsPanel } from "@/components/console/panels/AgentsPanel";
import { PaymentsPanel } from "@/components/console/panels/PaymentsPanel";
import { PrivacyPanel } from "@/components/console/panels/PrivacyPanel";
import { RuntimeProvider } from "@/components/console/runtime-provider";
import { Footer } from "@/components/layout/Footer";
import { Nav } from "@/components/layout/Nav";
import { ArchitectureTerminal } from "@/components/sections/ArchitectureTerminal";
import { ConsoleSection } from "@/components/sections/ConsoleSection";
import { Feature, FeatureWindow } from "@/components/sections/Feature";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { MainnetProof } from "@/components/sections/MainnetProof";
import { Modules } from "@/components/sections/Modules";
import { QuickStart } from "@/components/sections/QuickStart";
import { Statement } from "@/components/sections/Statement";
import { UseCases } from "@/components/sections/UseCases";
import { Reveal } from "@/components/ui/Reveal";
import { FEATURES } from "@/content/site";

const [privacy, payments, agents] = FEATURES;

export default function HomePage() {
  return (
    <BootProvider>
      <BootScreen />
      <Nav />

      <RuntimeProvider>
        <main>
          <div className="hero-wrap">
            <Hero />
            <section className="heroshot container" id="architecture-demo" aria-label="Architecture terminal demo">
              <Reveal y={28} amount={0.1}>
                <ArchitectureTerminal />
              </Reveal>
            </section>
          </div>

          <Modules />
          <MainnetProof />
          <Statement />

          <Feature
            id="product"
            feature={privacy}
            media={
              <FeatureWindow title="sherwood · privacy">
                <PrivacyPanel />
              </FeatureWindow>
            }
          />
          <Feature
            feature={payments}
            media={
              <FeatureWindow title="sherwood · x402 payments" tone="glade">
                <PaymentsPanel layout="stacked" />
              </FeatureWindow>
            }
          />
          <Feature
            feature={agents}
            media={
              <FeatureWindow title="sherwood · agents" tone="deep">
                <AgentsPanel variant="compact" />
              </FeatureWindow>
            }
          />

          <ConsoleSection />
          <HowItWorks />
          <UseCases />
          <QuickStart />
        </main>
      </RuntimeProvider>

      <Footer />
    </BootProvider>
  );
}
