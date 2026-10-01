// A clay poker chip: solid centre, a ring of short edge stripes, cream inlay with the label.
// Buy-ins: orange stripes on red. Cash-outs: gold stripes on green.

type Variant = "buyin" | "cashout";

const COLOURS: Record<Variant, { body: string; stripe: string }> = {
  buyin: { body: "var(--chip-red)", stripe: "var(--chip-orange)" },
  cashout: { body: "var(--chip-green)", stripe: "var(--gold)" },
};

export function ChipBadge({
  label,
  variant = "buyin",
  size = 40,
  className = "",
  title,
}: {
  label: string | number;
  variant?: Variant;
  size?: number;
  className?: string;
  title?: string;
}) {
  const { body, stripe } = COLOURS[variant];
  const stripes = Array.from({ length: 8 }, (_, i) => i * 45);
  const text = String(label);
  const fontSize = text.length > 2 ? 11 : 13;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={title ?? text}
      className={`shrink-0 ${className}`}
    >
      <circle cx="20" cy="20" r="19" fill={body} />
      {stripes.map((deg) => (
        <rect key={deg} x="17.5" y="1" width="5" height="7" rx="1" fill={stripe} transform={`rotate(${deg} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="12.5" fill="var(--cream)" />
      <circle cx="20" cy="20" r="12.5" fill="none" stroke={body} strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
      <text
        x="20"
        y="20.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill="#1a1a1c"
        style={{ fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" }}
      >
        {text}
      </text>
    </svg>
  );
}
