export default function LoadingMarketIcon() {
  return (
    <svg className="loading-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path fill="currentColor" d="M14 34h6v16h24V34h6v22H14z" />
      <g className="loading-awning">
        <path fill="currentColor" d="M18 14h28l9 20H9z" />
        <path fill="#f6f1e6" d="M25 14h5l-2 20H17zm10 0h5l7 20H37z" />
      </g>
      <g className="loading-shop-sign">
        <path d="M36 34v7" stroke="currentColor" strokeWidth="2" />
        <rect x="30" y="40" width="12" height="8" rx="1.5" fill="#bd6245" />
        <path d="M33 44h6" stroke="#fffaf0" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
