// Bộ icon nét (stroke) dùng chung, vẽ inline để không thêm thư viện.
const paths = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8M8 13h5" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  mapOff: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="m10 10 4 4M14 10l-4 4" /></>,
  building: <><path d="M3 21h18M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  bolt: <path d="M13 3 4 14h7l-1 7 9-11h-7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  flag: <path d="M4 21V4h12l-2 4 2 4H4" />,
  link: <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />,
  navigation: <path d="m3 11 18-8-8 18-2-8z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  searchOff: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8.5 11h5" /></>,
  gift: <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H8a2.5 2.5 0 1 1 0-5c3 0 4 5 4 5zM12 7h4a2.5 2.5 0 1 0 0-5c-3 0-4 5-4 5z" />,
  trend: <><path d="M3 17l5-5 4 4 8-8" /><path d="M15 8h5v5" /></>,
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" /></>,
  wallet: <><path d="M3 7h18v12H3z" /><path d="M16 13h2M3 7l3-3h12v3" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>,
  swap: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 8" /></>,
  ticket: <><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z" /><path d="M13 6v12" /></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = '', label }: { name: IconName; className?: string; label?: string }) {
  // Mặc định 20px khi className không tự đặt kích thước.
  const size = /(^|\s)!?h-/.test(className) ? '' : 'h-5 w-5 ';
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${size}${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {paths[name]}
    </svg>
  );
}
