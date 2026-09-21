import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { visibleNav } from '../nav';
import CommandPalette from './CommandPalette';

function Icon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    income: <><path d="M12 20V4M6 10l6-6 6 6" /><path d="M5 20h14" /></>,
    expenses: <><path d="M12 4v16M18 14l-6 6-6-6" /><path d="M5 4h14" /></>,
    statements: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h4" /></>,
    reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    activity: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    admin: <><circle cx="12" cy="8" r="3" /><path d="M5 21c.5-4 2.8-6 7-6s6.5 2 7 6" /></>,
    signout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function Layout({ children }) {
  const access = useAuth();
  const { user, roleName, logout } = access;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand-row">
        <div className="brand" aria-label="Solucio Payment and Receipt">
          <span className="brand-mark">S</span><span>solucio</span>
        </div>
          <button type="button" className="sidebar-toggle" onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={sidebarCollapsed}>
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={sidebarCollapsed ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} /></svg>
          </button>
        </div>
        <p className="nav-label">Workspace</p>
        <nav className="side-nav" aria-label="Main navigation">
          {visibleNav(access).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} aria-label={i.label} title={sidebarCollapsed ? i.label : undefined}><Icon name={i.icon} /><span>{i.label}</span></NavLink>
          ))}
        </nav>
        <div className="profile">
          <span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span>
          <span className="profile-copy"><b>{user.name}</b><small>{roleName || user.role}</small></span>
          <button className="signout" onClick={logout} aria-label="Sign out"><Icon name="signout" /></button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="mobile-head"><div className="brand"><span className="brand-mark">S</span><span>solucio</span></div><span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span></header>
        <header className="workspace-head">
          <div><strong>Welcome back, {user.name?.split(' ')[0]}!</strong><span>Here is your payment workspace.</span></div>
          <CommandPalette />
          <div className="workspace-user"><span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span><span><b>{user.name}</b><small>Solucio workspace</small></span></div>
        </header>
        <main>{children}</main>
        <nav className="mobile-nav" aria-label="Main navigation">
          {visibleNav(access).slice(0, 5).map((i) => <NavLink key={i.to} to={i.to} end={i.to === '/'} aria-label={`Navigate to ${i.label}`}><Icon name={i.icon} /><span>{i.label}</span></NavLink>)}
        </nav>
      </div>
    </div>
  );
}
