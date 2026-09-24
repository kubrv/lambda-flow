type Props = {
  className?: string;
  height?: number;
  showWordmark?: boolean;
  /** Subtítulo opcional ao lado do nome (ex.: no rodapé). */
  tagline?: string;
};

/**
 * Logo Lambda-Flow: badge do pacote lambda-strike + wordmark em HTML (Orbitron).
 * Evita SVG com <text> via <img>, que some quando a fonte não embute.
 */
export function BrandLogo({
  className = "",
  height = 40,
  showWordmark = true,
  tagline,
}: Props) {
  const mark = Math.round(height * 1.05);
  return (
    <div className={`brand-row ${className}`.trim()} aria-label="Lambda-Flow">
      <img
        className="brand-mark"
        src="/badge.svg"
        alt=""
        width={mark}
        height={mark}
        decoding="async"
      />
      {showWordmark ? (
        <span className="brand-wordmark-text">
          <strong>Lambda-Flow</strong>
          {tagline ? <small>{tagline}</small> : null}
        </span>
      ) : null}
    </div>
  );
}
