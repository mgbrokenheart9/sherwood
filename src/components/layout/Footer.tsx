import { Brand } from "@/components/brand/BrandMark";
import { MaskReveal } from "@/components/ui/MaskReveal";
import { IS_MAINNET } from "@/content/deployment";
import { FOOTER_LINKS, isExternal, SITE } from "@/content/site";

export function Footer() {
  return (
    <footer className="footer container">
      <div className="footer__top">
        <Brand />
        <nav className="footer__links" aria-label="Footer">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={isExternal(link.href) && !link.href.startsWith("mailto:") ? "_blank" : undefined}
              rel="noopener noreferrer"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      <MaskReveal className="footer__word" duration={1} delay={0.05}>
        sherwood
      </MaskReveal>

      <div className="footer__meta">
        <span className="metaline">© {new Date().getFullYear()} {SITE.name} · Powered by {SITE.protocol}</span>
        <span className="metaline">MIT License · {IS_MAINNET ? "Live on Robinhood Chain mainnet" : "Robinhood Chain testnet · test funds only"}</span>
      </div>
    </footer>
  );
}
