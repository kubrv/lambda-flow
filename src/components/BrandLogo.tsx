type Props = {
  className?: string;
  height?: number;
  showWordmark?: boolean;
};

/** Logo estável: badge + wordmark (evita lockup SVG bugado / CSS 52×52). */
export function BrandLogo({
  className = "",
  height = 40,
  showWordmark = true,
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
      />
      {showWordmark ? (
        <img
          className="brand-wordmark"
          src="/wordmark.svg"
          alt="Lambda-Flow"
          height={Math.round(height * 0.72)}
        />
      ) : null}
    </div>
  );
}
