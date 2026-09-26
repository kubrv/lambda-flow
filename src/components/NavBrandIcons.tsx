/** Ícones Maps / Waze para botões de navegação. */

export function GoogleMapsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
      />
      <circle fill="#fff" cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function WazeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#33C9FF"
        d="M12 2C7.03 2 3 5.7 3 10.3c0 2.6 1.3 4.9 3.3 6.5L5 21l4.2-1.6c.9.3 1.8.4 2.8.4 4.97 0 9-3.7 9-8.5S16.97 2 12 2z"
      />
      <circle fill="#031018" cx="9.2" cy="10" r="1.2" />
      <circle fill="#031018" cx="14.8" cy="10" r="1.2" />
    </svg>
  );
}
