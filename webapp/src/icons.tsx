/** Small stroke icons (24px grid, drawn at 1.75px). Decorative: always paired with a text label. */
import type {ReactNode} from 'react';

const I = ({children}: {children: ReactNode}) => (
  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  eye: <I><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></I>,
  heart: <I><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></I>,
  comment: <I><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></I>,
  share: <I><path d="M4 12v8h16v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></I>,
  users: <I><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></I>,
  pulse: <I><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></I>,
  film: <I><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4" /></I>,
  send: <I><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></I>,
  play: <I><path d="M7 4.5v15l13-7.5z" /></I>,
  close: <I><path d="M6 6l12 12M18 6 6 18" /></I>,
  calendar: <I><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></I>,
  clock: <I><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>,
  check: <I><path d="M20 6 9 17l-5-5" /></I>,
  info: <I><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></I>,
  chat: <I><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></I>,
  external: <I><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></I>,
  trend: <I><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></I>,
  alert: <I><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></I>,
  grid: <I><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></I>,
  sound: <I><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></I>,
  muted: <I><path d="M11 5 6 9H2v6h4l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></I>,
  refresh: <I><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></I>,
  target: <I><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></I>,
  trophy: <I><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></I>,
  search: <I><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></I>,
  sort: <I><path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" /></I>,
  home: <I><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></I>,
  chevron: <I><path d="m9 6 6 6-6 6" /></I>,
};
