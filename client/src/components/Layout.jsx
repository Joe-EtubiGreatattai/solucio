import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { visibleNav } from '../nav';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <strong>Solucio</strong>
        <nav>
          {visibleNav(user.role).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'}>{i.label}</NavLink>
          ))}
        </nav>
        <span className="who">
          {user.name} ({user.role}) <button onClick={logout}>Sign out</button>
        </span>
      </header>
      <main>{children}</main>
    </div>
  );
}
