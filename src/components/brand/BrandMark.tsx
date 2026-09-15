/** Sherwood mark: a three-tier pine tree traced from assets/brand/sherwood-logo-source.png. Path box is 37.05 × 60. */
export const BRAND_PATH =
  "M18.52 0L31.01 17.06L24.96 17.06L34.61 29.57L27.08 29.57L37.05 42.41L21.69 42.41L21.69 60L15.36 60L15.36 42.41L0 42.41L9.97 29.57L2.44 29.57L12.09 17.06L6.04 17.06Z";

export const BRAND_BOX = { width: 37.05, height: 60 } as const;

const GRADIENT_ID = "sherwood-leaf";

/**
 * The logo's lichen-to-fern gradient, shared by every mark on the page.
 * Rendered once in the root layout: a zero-size (not display:none) SVG keeps the reference paintable.
 */
export function BrandGradient() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ddf2a8" />
        <stop offset="0.5" stopColor="#7cc48a" />
        <stop offset="1" stopColor="#298d5c" />
      </linearGradient>
    </svg>
  );
}

export function BrandMark({ size = 24, solid = false, className }: { size?: number; solid?: boolean; className?: string }) {
  const width = Math.round((size * BRAND_BOX.width) / BRAND_BOX.height);
  return (
    <svg
      className={className}
      width={width}
      height={size}
      viewBox={`0 0 ${BRAND_BOX.width} ${BRAND_BOX.height}`}
      fill={solid ? "currentColor" : `url(#${GRADIENT_ID})`}
      aria-hidden="true"
    >
      <path d={BRAND_PATH} />
    </svg>
  );
}

export function Brand({ size = 24 }: { size?: number }) {
  return (
    <a className="brand" href="#top" aria-label="Sherwood home">
      <BrandMark size={size} />
      <span>sherwood</span>
    </a>
  );
}
