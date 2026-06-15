/* Shared helpers: calendar grid + simple line icons (currentColor).
   Icons are minimal geometric UI glyphs — drawn inline, no icon lib. */

// Mon-first month grid -> array of weeks, each 7 cells ({day} or null)
function buildMonth(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let startDow = first.getDay(); // 0=Sun
  startDow = (startDow + 6) % 7; // Mon=0
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Minimal icon set. Props: name, size (default 22), sw (stroke width, default 1.8)
function Ic({ name, size = 22, sw = 1.8, style = {} }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const fp = { fill: 'currentColor', stroke: 'none' };
  const paths = {
    home: <path {...p} d="M3 10.5L12 3l9 7.5M5 9.5V20h14V9.5M9.5 20v-5.5h5V20" />,
    calendar: <g {...p}><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></g>,
    tasks: <g {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 12l3 3 5-6" /></g>,
    more: <g {...fp}><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></g>,
    chevL: <path {...p} d="M15 5l-7 7 7 7" />,
    chevR: <path {...p} d="M9 5l7 7-7 7" />,
    chevDown: <path {...p} d="M5 9l7 7 7-7" />,
    plus: <path {...p} d="M12 5v14M5 12h14" />,
    bell: <g {...p}><path d="M6 9a6 6 0 1112 0c0 4 1.5 6 1.5 6h-15S6 13 6 9z" /><path d="M10 20a2 2 0 004 0" /></g>,
    search: <g {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></g>,
    camera: <g {...p}><path d="M3 8.5A2.5 2.5 0 015.5 6H8l1.5-2h5L16 6h2.5A2.5 2.5 0 0121 8.5V18a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="12" cy="13" r="3.5" /></g>,
    arrowUR: <path {...p} d="M7 17L17 7M9 7h8v8" />,
    arrowDR: <path {...p} d="M7 7l10 10M9 17h8V9" />,
    clock: <g {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></g>,
    pin: <g {...p}><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></g>,
    filter: <path {...p} d="M3 5h18l-7 8v6l-4 2v-8z" />,
    user: <g {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></g>,
    grid: <g {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></g>,
    spark: <path {...p} d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" />,
    check: <path {...p} d="M5 12.5l4.5 4.5L19 6.5" />,
    settings: <g {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7L5.3 5.3" /></g>,
    logout: <g {...p}><path d="M14 4H6a2 2 0 00-2 2v12a2 2 0 002 2h8M16 8l4 4-4 4M9 12h11" /></g>,
    file: <g {...p}><path d="M6 3h8l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M14 3v5h5" /></g>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function ScreenShell({ c, children }) {
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: c.bg, color: c.ink }}>{children}</div>;
}

Object.assign(window, { buildMonth, Ic, ScreenShell });
