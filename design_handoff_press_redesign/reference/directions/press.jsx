/* DIRECTION B — "PRESS" : bold display.
   Anton (huge condensed headlines/numbers) + Space Grotesk (UI). Near-black + acid lime. */

function DirectionPress({ theme = 'light', view, syncId, onToggleTheme }) {
  const A = window.AGENCY;
  const [tab, setTab] = React.useState('home');
  React.useEffect(() => { if (view) setTab(view); }, [syncId]);
  const dark = theme === 'dark';

  const c = dark ? {
    bg: '#0A0A0A', surface: '#121212', raised: '#181818',
    ink: '#FAFAFA', ink2: 'rgba(250,250,250,0.55)', ink3: 'rgba(250,250,250,0.34)',
    line: 'rgba(255,255,255,0.09)', line2: 'rgba(255,255,255,0.16)',
    accent: '#D6F84A', onAccent: '#0A0A0A',
  } : {
    bg: '#FFFFFF', surface: '#FAFAF9', raised: '#F2F2F0',
    ink: '#0A0A0A', ink2: '#5B5B58', ink3: '#A0A09C',
    line: '#EAEAE7', line2: '#D8D8D4',
    accent: '#C7EA1E', onAccent: '#0A0A0A',
  };
  const TYPE = { reels: '#8B7BFF', post: '#3DDC84', carousel: '#FFB020', stories: '#FF5C5C' };
  const STATUS = { idea: c.ink3, in_progress: '#FF5C5C', review: '#FFB020', published: '#3DDC84' };

  const disp = "'Anton', 'Arial Narrow', sans-serif";
  const sans = "'Space Grotesk', system-ui, sans-serif";
  const eyebrow = { fontFamily: sans, fontSize: 10.5, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: c.ink3 };
  const sqBtn = { all: 'unset', cursor: 'pointer', width: 40, height: 40, borderRadius: 11, border: `1px solid ${c.line2}`, display: 'grid', placeItems: 'center', color: c.ink2 };

  const Head = ({ over, big }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
      <div style={{ fontFamily: disp, fontSize: 17, letterSpacing: 0.5, color: c.ink, textTransform: 'uppercase' }}>1M<span style={{ color: c.accent }}>.</span>AGENCY</div>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
        <button style={sqBtn}><Ic name="bell" size={19} /></button>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: c.accent, color: c.onAccent, display: 'grid', placeItems: 'center', fontFamily: disp, fontSize: 16 }}>{A.user.initials}</div>
      </div>
    </div>
  );

  // ---- DASHBOARD ----
  const Dash = () => (
    <div style={{ padding: '54px 20px 12px' }}>
      <Head />
      <div style={eyebrow}>Понедельник · 13 июня</div>

      {/* hero metric */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontFamily: disp, fontSize: 108, lineHeight: 0.82, color: c.accent, letterSpacing: -1 }}>124</div>
          <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: c.ink, background: dark ? 'rgba(214,248,74,0.14)' : 'rgba(199,234,30,0.3)', padding: '5px 9px', borderRadius: 8, marginTop: 8 }}>+31</div>
        </div>
        <div style={{ fontFamily: disp, fontSize: 30, lineHeight: 0.95, color: c.ink, textTransform: 'uppercase', marginTop: 4, letterSpacing: 0.3 }}>Постов опубликовано<br />в июне</div>
      </div>

      {/* 3 stat cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 24 }}>
        {A.stats.slice(0, 3).map((s) => (
          <div key={s.key} style={{ border: `1px solid ${c.line}`, borderRadius: 14, padding: '14px 12px', background: c.surface }}>
            <div style={{ fontFamily: disp, fontSize: 38, lineHeight: 0.85, color: c.ink }}>{s.value}</div>
            <div style={{ fontFamily: sans, fontSize: 9.5, fontWeight: 600, color: c.ink2, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 1.25 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* shoots */}
      <SectionHeadP title="Ближайшие съёмки" c={c} disp={disp} sans={sans} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {A.shoots.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: c.surface, border: `1px solid ${c.line}`, borderRadius: 14 }}>
            <div style={{ textAlign: 'center', minWidth: 38 }}>
              <div style={{ fontFamily: disp, fontSize: 30, lineHeight: 0.8, color: c.ink }}>{s.day}</div>
              <div style={{ ...eyebrow, fontSize: 9, marginTop: 3 }}>{s.mon}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 14, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.client}</div>
              <div style={{ fontFamily: sans, fontSize: 12, color: c.ink2, marginTop: 2 }}>{s.place} · {s.time}</div>
            </div>
            <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TYPE[s.accent], border: `1px solid ${TYPE[s.accent]}`, padding: '4px 8px', borderRadius: 7 }}>{s.kind}</span>
          </div>
        ))}
      </div>

      {/* progress */}
      <SectionHeadP title="Прогресс по клиентам" c={c} disp={disp} sans={sans} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {A.clients.slice(0, 5).map((cl) => {
          const pct = Math.round((cl.done / cl.total) * 100);
          return (
            <div key={cl.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.4 }}>{cl.name}</span>
                <span style={{ fontFamily: disp, fontSize: 22, color: c.ink }}>{pct}%</span>
              </div>
              <div style={{ height: 7, borderRadius: 0, background: c.line2, overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: c.accent }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---- CALENDAR ----
  const Cal = () => {
    const [sel, setSel] = React.useState(A.today);
    const weeks = window.buildMonth(A.year, A.monthIndex);
    const dayPosts = A.calendar[sel] || [];
    return (
      <div style={{ padding: '54px 0 12px' }}>
        <div style={{ padding: '0 20px' }}>
          <Head />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={eyebrow}>Контент-календарь</div>
              <h1 style={{ fontFamily: disp, fontSize: 56, lineHeight: 0.82, color: c.ink, margin: '6px 0 0', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Июнь <span style={{ color: c.ink3 }}>’26</span></h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={sqBtn}><Ic name="chevL" size={18} /></button>
              <button style={sqBtn}><Ic name="chevR" size={18} /></button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 20px 4px', scrollbarWidth: 'none' }}>
          {['Все', 'Кофейня DRIP', 'FIT Lab', 'Bloom Beauty'].map((f, i) => (
            <div key={f} style={{ flexShrink: 0, whiteSpace: 'nowrap', fontFamily: sans, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 13px', borderRadius: 9, border: `1px solid ${i === 0 ? c.accent : c.line2}`, background: i === 0 ? c.accent : 'transparent', color: i === 0 ? c.onAccent : c.ink2 }}>{f}</div>
          ))}
        </div>

        <div style={{ padding: '14px 12px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 8 }}>
            {A.weekdays.map((w) => <div key={w} style={{ textAlign: 'center', ...eyebrow, fontSize: 9 }}>{w}</div>)}
          </div>
          {weeks.map((wk, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
              {wk.map((d, di) => {
                const posts = d ? (A.calendar[d] || []) : [];
                const isToday = d === A.today, isSel = d === sel;
                return (
                  <button key={di} onClick={() => d && setSel(d)} style={{ all: 'unset', cursor: d ? 'pointer' : 'default', height: 48, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', background: isSel ? c.accent : (isToday ? (dark ? 'rgba(214,248,74,0.12)' : 'rgba(199,234,30,0.25)') : 'transparent'), border: d ? `1px solid ${isSel ? c.accent : c.line}` : 'none' }}>
                    {d && <div style={{ fontFamily: disp, fontSize: 17, color: isSel ? c.onAccent : c.ink }}>{d}</div>}
                    {posts.length > 0 && (
                      <div style={{ display: 'flex', gap: 2.5, position: 'absolute', bottom: 6 }}>
                        {posts.slice(0, 3).map((p, pi) => <span key={pi} style={{ width: 4.5, height: 4.5, borderRadius: '50%', background: isSel ? c.onAccent : TYPE[p.type] }} />)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, padding: '0 20px' }}>
          <div style={{ fontFamily: disp, fontSize: 24, color: c.ink, textTransform: 'uppercase', marginBottom: 12 }}>{sel} ИЮНЯ <span style={{ color: c.ink3, fontSize: 16 }}>/ {dayPosts.length} публ.</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayPosts.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', background: c.surface, border: `1px solid ${c.line}`, borderRadius: 13, borderLeft: `4px solid ${TYPE[p.type]}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13.5, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.3 }}>{p.client}</div>
                  <div style={{ fontFamily: sans, fontSize: 11.5, color: c.ink2, marginTop: 2 }}>{A.TYPES[p.type].label}</div>
                </div>
                <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: STATUS[p.status] }}>{A.STATUSES[p.status].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ---- TASKS (kanban) ----
  const Tasks = () => {
    const counts = (k) => (A.tasks[k] || []).length;
    return (
      <div style={{ padding: '54px 0 12px' }}>
        <div style={{ padding: '0 20px' }}>
          <Head />
          <div style={eyebrow}>Доска задач команды</div>
          <h1 style={{ fontFamily: disp, fontSize: 52, lineHeight: 0.82, color: c.ink, margin: '6px 0 0', textTransform: 'uppercase' }}>Задачи</h1>
        </div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '20px 20px 4px', scrollbarWidth: 'none' }}>
          {A.taskColumns.map((col) => (
            <div key={col.key} style={{ flexShrink: 0, width: 250 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.key === 'done' ? c.accent : (col.key === 'review' ? '#FFB020' : (col.key === 'in_progress' ? '#8B7BFF' : c.ink3)) }} />
                <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: c.ink }}>{col.label}</span>
                <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: c.ink3 }}>{counts(col.key)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(A.tasks[col.key] || []).map((t) => (
                  <div key={t.id} style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 14, padding: '13px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                      <span style={{ fontFamily: sans, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: TYPE[t.type], border: `1px solid ${TYPE[t.type]}`, padding: '3px 7px', borderRadius: 6 }}>{A.TYPES[t.type].label}</span>
                      <span style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: t.due === 'сегодня' ? '#FF5C5C' : c.ink3 }}>{t.due}</span>
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 600, color: c.ink, lineHeight: 1.3 }}>{t.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                      <span style={{ fontFamily: sans, fontSize: 11, color: c.ink2 }}>{t.client}</span>
                      <span style={{ width: 24, height: 24, borderRadius: 7, background: c.raised, border: `1px solid ${c.line2}`, color: c.ink2, display: 'grid', placeItems: 'center', fontFamily: sans, fontSize: 9.5, fontWeight: 700 }}>{t.who}</span>
                    </div>
                  </div>
                ))}
                <button style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', border: `1px dashed ${c.line2}`, borderRadius: 12, color: c.ink3, fontFamily: sans, fontSize: 12, fontWeight: 600 }}><Ic name="plus" size={15} sw={2} />Добавить</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---- PROFILE ----
  const Toggle = ({ on, onClick }) => (
    <button onClick={onClick} style={{ all: 'unset', cursor: 'pointer', width: 46, height: 27, borderRadius: 20, background: on ? c.accent : c.line2, position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 21, height: 21, borderRadius: '50%', background: on ? c.onAccent : '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
  const Profile = () => {
    const [push, setPush] = React.useState(true);
    const rows = [
      { label: 'Тёмная тема', toggle: dark, onToggle: onToggleTheme },
      { label: 'Push-уведомления', toggle: push, onToggle: () => setPush((v) => !v) },
      { label: 'Команда', detail: '7 человек', chev: true },
      { label: 'Язык', detail: 'Русский', chev: true },
    ];
    return (
      <div style={{ padding: '54px 20px 12px' }}>
        <Head />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: c.accent, color: c.onAccent, display: 'grid', placeItems: 'center', fontFamily: disp, fontSize: 30 }}>{A.user.initials}</div>
          <div>
            <div style={{ fontFamily: disp, fontSize: 30, color: c.ink, textTransform: 'uppercase', lineHeight: 0.9 }}>{A.user.name}</div>
            <div style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: c.ink2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 5 }}>{A.user.role}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 22 }}>
          {A.profileStats.map((s) => (
            <div key={s.label} style={{ border: `1px solid ${c.line}`, borderRadius: 14, padding: '14px 12px', background: c.surface }}>
              <div style={{ fontFamily: disp, fontSize: 34, lineHeight: 0.85, color: c.ink }}>{s.value}</div>
              <div style={{ fontFamily: sans, fontSize: 9.5, fontWeight: 600, color: c.ink2, marginTop: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontFamily: disp, fontSize: 22, color: c.ink, textTransform: 'uppercase', margin: '30px 0 12px' }}>Настройки</h2>
        <div style={{ border: `1px solid ${c.line}`, borderRadius: 16, background: c.surface, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', padding: '15px 16px', borderTop: i === 0 ? 'none' : `1px solid ${c.line}` }}>
              <span style={{ flex: 1, fontFamily: sans, fontSize: 14, fontWeight: 600, color: c.ink }}>{r.label}</span>
              {r.toggle !== undefined && <Toggle on={r.toggle} onClick={r.onToggle} />}
              {r.detail && <span style={{ fontFamily: sans, fontSize: 13, color: c.ink2, marginRight: r.chev ? 8 : 0 }}>{r.detail}</span>}
              {r.chev && <span style={{ color: c.ink3 }}><Ic name="chevR" size={17} /></span>}
            </div>
          ))}
        </div>

        <button style={{ all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', marginTop: 16, padding: '15px 0', border: `1px solid ${c.line2}`, borderRadius: 14, fontFamily: sans, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#FF5C5C', boxSizing: 'border-box' }}>Выйти из аккаунта</button>
      </div>
    );
  };

  const tabs = [
    { id: 'home', icon: 'home', label: 'Главная' },
    { id: 'cal', icon: 'calendar', label: 'Календарь' },
    { id: 'tasks', icon: 'tasks', label: 'Задачи' },
    { id: 'me', icon: 'user', label: 'Профиль' },
  ];

  return (
    <ScreenShell c={c}>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div key={tab} className="pressSwap">
          {tab === 'home' && <Dash />}
          {tab === 'cal' && <Cal />}
          {tab === 'tasks' && <Tasks />}
          {tab === 'me' && <Profile />}
        </div>
      </div>
      <div style={{ display: 'flex', padding: '8px 14px 26px', borderTop: `1px solid ${c.line}`, background: c.surface, gap: 4 }}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 0', color: on ? c.ink : c.ink3 }}>
              <div style={{ position: 'relative' }}>
                <Ic name={t.icon} size={22} sw={on ? 2.1 : 1.7} />
                {on && <span style={{ position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)', width: 16, height: 3, borderRadius: 2, background: c.accent }} />}
              </div>
              <span style={{ fontFamily: sans, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </ScreenShell>
  );
}

function SectionHeadP({ title, c, disp }) {
  return <h2 style={{ fontFamily: disp, fontSize: 26, color: c.ink, textTransform: 'uppercase', margin: '32px 0 14px', letterSpacing: 0.3 }}>{title}</h2>;
}
function PlaceholderP({ c, disp, sans, icon, name }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div style={{ width: 66, height: 66, borderRadius: 16, background: c.accent, color: c.onAccent, display: 'grid', placeItems: 'center', marginBottom: 18 }}><Ic name={icon} size={28} sw={2} /></div>
      <div style={{ fontFamily: disp, fontSize: 34, color: c.ink, textTransform: 'uppercase' }}>{name}</div>
      <div style={{ fontFamily: sans, fontSize: 13, color: c.ink2, marginTop: 6, maxWidth: 220 }}>Этот раздел — в следующей итерации редизайна.</div>
    </div>
  );
}

Object.assign(window, { DirectionPress, SectionHeadP, PlaceholderP });
