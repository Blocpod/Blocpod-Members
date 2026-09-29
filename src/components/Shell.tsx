import {
  NavLink,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  CircleHelp,
  Compass,
  Hammer,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { post } from '../lib/api';
import { Logo } from './UI';
const links = [
  { to: '/app', name: 'Overview', icon: Compass, end: true },
  { to: '/app/intelligence', name: 'Intelligence', icon: Sparkles },
  { to: '/app/library', name: 'Library', icon: BookOpen },
  { to: '/app/build', name: 'Build Queue', icon: Hammer },
  { to: '/app/community', name: 'Community', icon: MessageSquare },
  { to: '/app/workspace', name: 'My workspace', icon: Boxes },
];
export default function Shell() {
  const { user, refresh, demo } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const logout = async () => {
    await post('/auth/logout');
    await refresh();
    navigate('/login');
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {open && (
        <button
          aria-label="Close navigation"
          className="sidebar-overlay"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Link to="/app">
            <Logo />
          </Link>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="network-label">
          <span className="live-dot" /> OPERATING NETWORK<span>01</span>
        </div>
        <nav aria-label="Member navigation">
          {links.map(({ to, name, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={18} />
              <span>{name}</span>
              {name === 'Build Queue' && <span className="nav-tag">BUILD</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foundry">
          <span className="eyebrow">BEYOND THE BLUEPRINT</span>
          <h3>Build it with Blocpod.</h3>
          <p>
            For the problems that need
            <br />a deeper partnership.
          </p>
          <Link to="/app/foundry">
            Explore Foundry <ArrowUpRight size={15} />
          </Link>
        </div>
        <nav className="sidebar-bottom" aria-label="Account navigation">
          {['admin', 'staff', 'moderator'].includes(user?.role || '') && (
            <NavLink to="/app/admin">
              <Shield size={17} />
              Administration
            </NavLink>
          )}
          <NavLink to="/app/account">
            <Settings size={17} />
            Settings & membership
          </NavLink>
          <Link to="/app/help">
            <CircleHelp size={17} />
            Help & getting started
          </Link>
        </nav>
        <div className="sidebar-user">
          <span className="avatar">
            {user?.name
              ?.split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.plan_id || 'New'} membership</span>
          </div>
          <button
            className="icon-button"
            onClick={logout}
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            THE NETWORK <span>/</span>{' '}
            <strong>
              {links.find((l) =>
                l.end
                  ? location.pathname === l.to
                  : location.pathname.startsWith(l.to),
              )?.name ||
                location.pathname.split('/')[2]?.replaceAll('-', ' ') ||
                'Overview'}
            </strong>
          </div>
          <form
            className="topbar-search"
            action="/app/search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/app/search?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={17} />
            <input
              aria-label="Search the network"
              placeholder="Search the network"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <Link
            className="icon-button"
            to="/app/notifications"
            aria-label="Notifications"
          >
            <Bell size={19} />
          </Link>
          <span className="topbar-avatar avatar">{user?.name?.[0]}</span>
        </header>
        {demo && (
          <div className="demo-banner">
            <span className="live-dot" /> LOCAL PREVIEW{' '}
            <span>Persistent demo workspace · example content is labeled</span>
          </div>
        )}
        <main id="main-content" className="app-main">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>BLOCPOD OPERATING NETWORK</span>
          <span>
            Build the system. Own the leverage. <ArrowUpRight size={12} />
          </span>
        </footer>
      </div>
    </div>
  );
}
