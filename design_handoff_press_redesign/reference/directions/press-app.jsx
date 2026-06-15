/* Standalone PRESS prototype — single device, app-level theme, fit-to-viewport. */
const { useState, useEffect, useRef } = React;

function PressApp() {
  const [theme, setTheme] = useState('dark');
  const [scale, setScale] = useState(0.9);
  const dark = theme === 'dark';

  useEffect(() => {
    const fit = () => {
      const s = Math.min(1.02, (window.innerHeight - 56) / 874, (window.innerWidth - 32) / 402);
      setScale(Math.max(0.5, s));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <div style={{ minHeight: '100vh', background: dark ? '#070707' : '#E4E4E1', transition: 'background .3s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', system-ui, sans-serif", position: 'relative', overflow: 'hidden' }}>
      {/* ambient glow */}
      <div style={{ position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 500, background: 'radial-gradient(ellipse, rgba(214,248,74,0.10), transparent 65%)', pointerEvents: 'none', opacity: dark ? 1 : 0.5 }} />

      {/* top chrome */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px' }}>
        <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, letterSpacing: 0.5, color: dark ? '#fafafa' : '#0a0a0a', textTransform: 'uppercase' }}>1M<span style={{ color: '#A9C70F' }}>.</span>AGENCY <span style={{ fontSize: 12, color: dark ? 'rgba(250,250,250,0.4)' : '#9a9a96' }}>/ PRESS</span></div>
        <button onClick={toggleTheme} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: `1px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'}`, color: dark ? '#fafafa' : '#0a0a0a', fontSize: 12.5, fontWeight: 600 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dark ? '#1c1c1c' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}` }} />
          {dark ? 'Тёмная' : 'Светлая'}
        </button>
      </div>

      {/* device */}
      <div style={{ width: 402 * scale, height: 874 * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 402, height: 874 }}>
          <window.IOSDevice dark={dark} width={402} height={874}>
            <window.DirectionPress theme={theme} onToggleTheme={toggleTheme} />
          </window.IOSDevice>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PressApp />);
