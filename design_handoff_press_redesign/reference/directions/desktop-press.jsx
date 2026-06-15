/* DESKTOP — "PRESS" direction. Sidebar + workspace. Anton + Space Grotesk, near-black + lime. */

function DesktopPress({ theme = 'dark', onToggleTheme }) {
  const A = window.AGENCY;
  const [nav, setNav] = React.useState('home');
  const dark = theme === 'dark';

  const c = dark ? {
    bg: '#0A0A0A', side: '#0E0E0E', surface: '#121212', raised: '#181818',
    ink: '#FAFAFA', ink2: 'rgba(250,250,250,0.55)', ink3: 'rgba(250,250,250,0.34)',
    line: 'rgba(255,255,255,0.09)', line2: 'rgba(255,255,255,0.16)',
    accent: '#D6F84A', onAccent: '#0A0A0A',
  } : {
    bg: '#F4F4F2', side: '#FFFFFF', surface: '#FFFFFF', raised: '#F2F2F0',
    ink: '#0A0A0A', ink2: '#5B5B58', ink3: '#A0A09C',
    line: '#EAEAE7', line2: '#D8D8D4',
    accent: '#C7EA1E', onAccent: '#0A0A0A',
  };
  const TYPE = { reels: '#8B7BFF', post: '#3DDC84', carousel: '#FFB020', stories: '#FF5C5C' };
  const STATUS = { idea: c.ink3, in_progress: '#FF5C5C', review: '#FFB020', published: '#3DDC84' };
  const tint = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
  const disp = "'Anton', sans-serif";
  const sans = "'Space Grotesk', system-ui, sans-serif";
  const eyebrow = { fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: c.ink3 };

  const navItems = [
    { id: 'home', icon: 'home', label: 'Дашборд' },
    { id: 'cal', icon: 'calendar', label: 'Календарь' },
    { id: 'content', icon: 'grid', label: 'Контент-план' },
    { id: 'tasks', icon: 'tasks', label: 'Задачи' },
    { id: 'shoots', icon: 'camera', label: 'Съёмки' },
    { id: 'target', icon: 'spark', label: 'Таргет' },
    { id: 'settings', icon: 'settings', label: 'Настройки' },
  ];

  // ───────── top bar ─────────
  const TopBar = ({ eyebrowText, title, children }) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '34px 40px 24px', borderBottom: `1px solid ${c.line}` }}>
      <div>
        <div style={eyebrow}>{eyebrowText}</div>
        <h1 style={{ fontFamily: disp, fontSize: 46, lineHeight: 0.85, color: c.ink, margin: '10px 0 0', textTransform: 'uppercase', letterSpacing: 0.3 }}>{title}</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {children}
        <button onClick={onToggleTheme} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, border: `1px solid ${c.line2}`, color: c.ink, fontFamily: sans, fontSize: 12.5, fontWeight: 600 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dark ? '#1c1c1c' : '#fff', border: `1px solid ${c.line2}` }} />
          {dark ? 'Тёмная' : 'Светлая'}
        </button>
      </div>
    </div>
  );
  const PrimaryBtn = ({ children }) => (
    <button style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, background: c.accent, color: c.onAccent, fontFamily: sans, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</button>
  );
  const GhostBtn = ({ children }) => (
    <button style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: `1px solid ${c.line2}`, color: c.ink2, fontFamily: sans, fontSize: 13, fontWeight: 600 }}>{children}</button>
  );

  // ───────── DASHBOARD ─────────
  const Dash = () => (
    <div>
      <TopBar eyebrowText="Понедельник · 13 июня" title="Сводка">
        <PrimaryBtn><Ic name="plus" size={16} sw={2.4} />Добавить</PrimaryBtn>
      </TopBar>
      <div style={{ padding: 40 }}>
        {/* hero + KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 2fr', gap: 18 }}>
          <div style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 18, padding: '26px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={eyebrow}>Опубликовано за июнь</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: disp, fontSize: 92, lineHeight: 0.78, color: c.accent, letterSpacing: -1 }}>124</span>
              <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: c.ink, background: tint(c.accent, dark ? 0.16 : 0.32), padding: '5px 10px', borderRadius: 8, marginBottom: 12 }}>+31</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, color: c.ink2, marginTop: 14 }}>На 33% больше, чем в мае. 6 клиентов в плане.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
            {A.stats.slice(0, 3).map((s) => (
              <div key={s.key} style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 18, padding: '24px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: c.raised, color: c.ink2, display: 'grid', placeItems: 'center' }}><Ic name={s.key === 'clients' ? 'user' : s.key === 'inwork' ? 'grid' : 'camera'} size={18} /></span>
                  <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: s.trend === 'up' ? '#3DDC84' : '#FF5C5C' }}>{s.delta}</span>
                </div>
                <div>
                  <div style={{ fontFamily: disp, fontSize: 52, lineHeight: 0.85, color: c.ink }}>{s.value}</div>
                  <div style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 600, color: c.ink2, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, marginTop: 18 }}>
          {/* shoots table */}
          <div style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 26px 16px' }}>
              <h2 style={{ fontFamily: disp, fontSize: 24, color: c.ink, textTransform: 'uppercase', margin: 0 }}>Ближайшие съёмки</h2>
              <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: c.accent, cursor: 'pointer' }}>Все →</span>
            </div>
            <div>
              {A.shoots.map((s, i) => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto auto', alignItems: 'center', gap: 16, padding: '16px 26px', borderTop: `1px solid ${c.line}` }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: disp, fontSize: 28, lineHeight: 0.8, color: c.ink }}>{s.day}</div>
                    <div style={{ ...eyebrow, fontSize: 9, marginTop: 3 }}>{s.mon}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 14.5, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.client}</div>
                    <div style={{ fontFamily: sans, fontSize: 12.5, color: c.ink2, marginTop: 2 }}>{s.place} · {s.time}</div>
                  </div>
                  <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TYPE[s.accent], border: `1px solid ${TYPE[s.accent]}`, padding: '4px 9px', borderRadius: 7 }}>{s.kind}</span>
                  <span style={{ color: c.ink3 }}><Ic name="chevR" size={17} /></span>
                </div>
              ))}
            </div>
          </div>
          {/* progress */}
          <div style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 18, padding: '22px 26px 26px' }}>
            <h2 style={{ fontFamily: disp, fontSize: 24, color: c.ink, textTransform: 'uppercase', margin: '0 0 18px' }}>Прогресс</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {A.clients.map((cl) => {
                const pct = Math.round((cl.done / cl.total) * 100);
                return (
                  <div key={cl.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                      <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.3 }}>{cl.name}</span>
                      <span style={{ fontFamily: disp, fontSize: 20, color: c.ink }}>{pct}%</span>
                    </div>
                    <div style={{ height: 7, background: c.line2, overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: c.accent }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ───────── CALENDAR ─────────
  const Cal = () => {
    const [sel, setSel] = React.useState(A.today);
    const weeks = window.buildMonth(A.year, A.monthIndex);
    return (
      <div>
        <TopBar eyebrowText="Контент-план" title="Июнь 2026">
          <GhostBtn><Ic name="file" size={16} />PDF</GhostBtn>
          <GhostBtn><Ic name="chevL" size={16} /></GhostBtn>
          <GhostBtn><Ic name="chevR" size={16} /></GhostBtn>
          <PrimaryBtn><Ic name="plus" size={16} sw={2.4} />Пост</PrimaryBtn>
        </TopBar>
        <div style={{ padding: 40 }}>
          {/* filters + legend */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Все', 'Кофейня DRIP', 'FIT Lab', 'Bloom Beauty', 'Студия NOVA'].map((f, i) => (
                <div key={f} style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 14px', borderRadius: 9, border: `1px solid ${i === 0 ? c.accent : c.line2}`, background: i === 0 ? c.accent : 'transparent', color: i === 0 ? c.onAccent : c.ink2, cursor: 'pointer' }}>{f}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {Object.keys(TYPE).map((t) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: TYPE[t] }} />
                  <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 600, color: c.ink2 }}>{A.TYPES[t].label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* month grid */}
          <div style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {A.weekdays.map((w) => <div key={w} style={{ padding: '14px 16px', ...eyebrow, fontSize: 10, borderBottom: `1px solid ${c.line}`, borderRight: `1px solid ${c.line}` }}>{w}</div>)}
            </div>
            {weeks.map((wk, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: wi === 0 ? 'none' : `1px solid ${c.line}` }}>
                {wk.map((d, di) => {
                  const posts = d ? (A.calendar[d] || []) : [];
                  const isToday = d === A.today, isSel = d === sel;
                  return (
                    <div key={di} onClick={() => d && setSel(d)} style={{ minHeight: 116, padding: 10, borderRight: `1px solid ${c.line}`, cursor: d ? 'pointer' : 'default', background: isSel ? tint(c.accent, dark ? 0.08 : 0.14) : 'transparent', position: 'relative' }}>
                      {d && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                          <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: isToday ? c.accent : 'transparent', color: isToday ? c.onAccent : c.ink2, fontFamily: sans, fontSize: 13, fontWeight: 700 }}>{d}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {posts.slice(0, 3).map((p, pi) => (
                          <div key={pi} style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: c.ink, background: tint(TYPE[p.type], dark ? 0.18 : 0.14), borderLeft: `3px solid ${TYPE[p.type]}`, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.client}</div>
                        ))}
                        {posts.length > 3 && <div style={{ fontFamily: sans, fontSize: 10, color: c.ink3, paddingLeft: 4 }}>+{posts.length - 3} ещё</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ───────── TASKS ─────────
  const Tasks = () => (
    <div>
      <TopBar eyebrowText="Доска задач команды" title="Задачи">
        <PrimaryBtn><Ic name="plus" size={16} sw={2.4} />Задача</PrimaryBtn>
      </TopBar>
      <div style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, alignItems: 'start' }}>
        {A.taskColumns.map((col) => (
          <div key={col.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: col.key === 'done' ? c.accent : (col.key === 'review' ? '#FFB020' : (col.key === 'in_progress' ? '#8B7BFF' : c.ink3)) }} />
              <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: c.ink }}>{col.label}</span>
              <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: c.ink3 }}>{(A.tasks[col.key] || []).length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(A.tasks[col.key] || []).map((t) => (
                <div key={t.id} style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 14, padding: '15px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontFamily: sans, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: TYPE[t.type], border: `1px solid ${TYPE[t.type]}`, padding: '3px 8px', borderRadius: 6 }}>{A.TYPES[t.type].label}</span>
                    <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: t.due === 'сегодня' ? '#FF5C5C' : c.ink3 }}>{t.due}</span>
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: c.ink, lineHeight: 1.3 }}>{t.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                    <span style={{ fontFamily: sans, fontSize: 11.5, color: c.ink2 }}>{t.client}</span>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: c.raised, border: `1px solid ${c.line2}`, color: c.ink2, display: 'grid', placeItems: 'center', fontFamily: sans, fontSize: 10, fontWeight: 700 }}>{t.who}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const Placeholder = ({ label }) => (
    <div>
      <TopBar eyebrowText="Раздел" title={label} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 120, textAlign: 'center' }}>
        <div style={{ width: 76, height: 76, borderRadius: 18, background: c.accent, color: c.onAccent, display: 'grid', placeItems: 'center', marginBottom: 20 }}><Ic name={navItems.find((n) => n.label === label)?.icon || 'grid'} size={32} sw={2} /></div>
        <div style={{ fontFamily: disp, fontSize: 32, color: c.ink, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontFamily: sans, fontSize: 14, color: c.ink2, marginTop: 8, maxWidth: 320 }}>Этот раздел — в следующей итерации редизайна. Логика переносится из текущей версии без изменений.</div>
      </div>
    </div>
  );

  const labelFor = (id) => navItems.find((n) => n.id === id)?.label;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: c.bg, color: c.ink }}>
      {/* sidebar */}
      <aside style={{ width: 248, flexShrink: 0, background: c.side, borderRight: `1px solid ${c.line}`, display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '30px 26px 24px' }}>
          <div style={{ fontFamily: disp, fontSize: 26, letterSpacing: 0.5, color: c.ink, textTransform: 'uppercase' }}>1M<span style={{ color: c.accent }}>.</span>AGENCY</div>
          <div style={{ ...eyebrow, fontSize: 9, marginTop: 4 }}>Agency Platform</div>
        </div>
        <nav style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map((n) => {
            const on = nav === n.id;
            return (
              <button key={n.id} onClick={() => setNav(n.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13, padding: '11px 14px', borderRadius: 11, position: 'relative', background: on ? tint(c.accent, dark ? 0.12 : 0.2) : 'transparent', color: on ? c.ink : c.ink2 }}>
                {on && <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: c.accent }} />}
                <span style={{ color: on ? c.accent : c.ink3 }}><Ic name={n.icon} size={20} sw={on ? 2 : 1.7} /></span>
                <span style={{ fontFamily: sans, fontSize: 13.5, fontWeight: on ? 700 : 500 }}>{n.label}</span>
              </button>
            );
          })}
        </nav>
        <div style={{ padding: 16, borderTop: `1px solid ${c.line}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: c.accent, color: c.onAccent, display: 'grid', placeItems: 'center', fontFamily: disp, fontSize: 15 }}>{A.user.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: c.ink, whiteSpace: 'nowrap' }}>{A.user.name}</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: c.ink3 }}>{A.user.role}</div>
          </div>
          <span style={{ color: c.ink3, cursor: 'pointer' }}><Ic name="logout" size={18} /></span>
        </div>
      </aside>

      {/* main */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {nav === 'home' && <Dash />}
        {nav === 'cal' && <Cal />}
        {nav === 'tasks' && <Tasks />}
        {!['home', 'cal', 'tasks'].includes(nav) && <Placeholder label={labelFor(nav)} />}
      </main>
    </div>
  );
}

window.DesktopPress = DesktopPress;
