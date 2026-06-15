/* Standalone desktop PRESS — app-level theme. */
function DesktopApp() {
  const [theme, setTheme] = React.useState('dark');
  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return <window.DesktopPress theme={theme} onToggleTheme={toggle} />;
}
ReactDOM.createRoot(document.getElementById('root')).render(<DesktopApp />);
