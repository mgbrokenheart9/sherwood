"use client";

import { ArrowDown, List, X } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { XLogo } from "@/components/brand/XLogo";
import { Button } from "@/components/ui/Button";
import { LINKS, NAV_LINKS, isExternal } from "@/content/site";
import { cx } from "@/lib/cn";
import { useMediaQuery, useScrolledPast } from "@/lib/hooks";
import { EASE_OUT, EASE_SWIFT, canHover, useMotionPrefs } from "@/lib/motion";

const WIDTH = { full: 1360, collapsed: 172, expanded: 700 } as const;

export function Nav() {
  const { instant } = useMotionPrefs();
  const scrolled = useScrolledPast(20);
  const desktop = useMediaQuery("(min-width: 881px)");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const glass = scrolled;
  const expanded = glass && desktop && (hovered || focused);
  const chromeVisible = !glass || expanded || !desktop;
  const menuVisible = menuOpen && !desktop;

  useEffect(() => {
    if (!menuVisible) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuVisible]);

  const closeAll = () => {
    setHovered(false);
    setFocused(false);
    setMenuOpen(false);
  };

  const isleSpring = instant
    ? { duration: 0 }
    : expanded
      ? { type: "spring" as const, stiffness: 230, damping: 22, mass: 1.05 }
      : { type: "spring" as const, stiffness: 210, damping: 22, mass: 1.15 };

  return (
    <header className="nav-fixed" ref={headerRef}>
      <div className="nav__wrap">
        <motion.div
          initial={false}
          className={cx("nav__isle", glass ? "is-glass" : "is-top", glass && "is-ink", glass && desktop && "is-center")}
          onMouseEnter={() => canHover() && setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => canHover() && setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
          }}
          animate={{
            maxWidth: glass && desktop ? (expanded ? WIDTH.expanded : WIDTH.collapsed) : WIDTH.full,
            height: glass ? 54 : 72,
          }}
          transition={isleSpring}
        >
          <motion.span
            className="nav__isle-glass"
            aria-hidden="true"
            initial={false}
            animate={{ opacity: glass ? 1 : 0, filter: glass ? "blur(0px)" : "blur(6px)", scale: glass ? 1 : 0.965 }}
            transition={instant ? { duration: 0 } : { duration: 0.55, ease: EASE_OUT }}
          />

          <motion.a className="brand" href="#top" aria-label="Sherwood home" onClick={closeAll} layout="position" transition={isleSpring}>
            <BrandMark size={24} />
            <span>sherwood</span>
          </motion.a>

          <motion.div
            className="nav__chrome"
            initial={false}
            layout="position"
            animate={{
              maxWidth: chromeVisible ? 680 : 0,
              opacity: chromeVisible ? 1 : 0,
              filter: chromeVisible ? "blur(0px)" : "blur(10px)",
            }}
            transition={
              instant
                ? { duration: 0 }
                : { duration: expanded ? 0.44 : 0.34, ease: EASE_OUT, maxWidth: { duration: 0.44, ease: EASE_SWIFT }, layout: isleSpring }
            }
            style={{ pointerEvents: chromeVisible ? "auto" : "none" }}
            aria-hidden={!chromeVisible}
          >
            <motion.div
              className="nav__chrome-inner"
              initial={false}
              animate={{ x: chromeVisible ? 0 : -22 }}
              transition={instant ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 15, mass: 1 }}
            >
              <nav className="nav__links" aria-label="Primary">
                {NAV_LINKS.map((link) => {
                  const external = isExternal(link.href);
                  return (
                    <a
                      key={link.label}
                      className={cx("navlink", glass && "is-ink")}
                      href={link.href}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                    >
                      {link.label}
                      <span className="navlink__rule" aria-hidden="true" />
                    </a>
                  );
                })}
                <a
                  className={cx("navlink", "navlink--icon", glass && "is-ink")}
                  href={LINKS.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Sherwood on X"
                  title="Sherwood on X (@sherwoodpay)"
                >
                  <XLogo size={15} />
                  <span className="navlink__rule" aria-hidden="true" />
                </a>
              </nav>

              <Button
                magnetic
                variant="solid"
                onDark={glass}
                className="nav__cta"
                href="#console"
                icon={<ArrowDown size={15} weight="bold" />}
                iconDir="down"
              >
                Launch console
              </Button>

              <button
                ref={toggleRef}
                className="nav__mobile-toggle"
                type="button"
                aria-label={menuVisible ? "Close navigation" : "Open navigation"}
                aria-expanded={menuVisible}
                aria-controls="mobile-navigation"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="t-icon-swap" data-state={menuVisible ? "b" : "a"} aria-hidden="true">
                  <span className="t-icon" data-icon="a">
                    <List size={21} />
                  </span>
                  <span className="t-icon" data-icon="b">
                    <X size={21} />
                  </span>
                </span>
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence initial={false}>
        {menuVisible && (
          <motion.nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="nav__mobile-panel"
            initial={instant ? false : { opacity: 0, transform: "translateY(-8px) scale(0.97)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: instant ? "none" : "translateY(-4px) scale(0.99)", transition: { duration: instant ? 0 : 0.18 } }}
            transition={{ duration: instant ? 0 : 0.25, ease: EASE_OUT }}
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={closeAll}
                target={isExternal(link.href) ? "_blank" : undefined}
                rel={isExternal(link.href) ? "noopener noreferrer" : undefined}
              >
                {link.label}
              </a>
            ))}
            <a
              href={LINKS.x}
              onClick={closeAll}
              target="_blank"
              rel="noopener noreferrer"
              className="nav__mobile-link--icon"
            >
              <XLogo size={16} />
              <span>Sherwood on X</span>
            </a>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
