import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useSearchParams,
  Link,
} from 'react-router-dom';
import { useAuth } from './lib/auth';
import { post } from './lib/api';
import { ErrorMessage, Loading } from './components/UI';
import Shell from './components/Shell';
import Public from './pages/Public';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Library, { ResourceDetail } from './pages/Library';
import BuildQueue from './pages/BuildQueue';
import Community from './pages/Community';
import Workspace from './pages/Workspace';
import Account, { Foundry, Onboarding } from './pages/Account';
import { Help, Notifications, Policy, Search } from './pages/Utility';
const Admin = lazy(() => import('./pages/Admin'));
function Protected() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.onboarded && location.pathname !== '/app/onboarding')
    return <Navigate to="/app/onboarding" replace />;
  return <Outlet />;
}
function Verify() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="policy-page">
      <p className="eyebrow">ACCOUNT SECURITY</p>
      <h1>Verify your email.</h1>
      {done ? (
        <>
          <p>Your email is verified. You’re ready for your next step.</p>
          <Link className="button primary" to="/app">
            Open your workspace
          </Link>
        </>
      ) : (
        <>
          <p>
            Confirm this address belongs to you to activate paid membership and
            protected actions.
          </p>
          <ErrorMessage error={error} />
          <button
            className="button primary"
            onClick={async () => {
              try {
                await post('/auth/verify-email', {
                  token: params.get('token'),
                });
                await refresh();
                setDone(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Verify email address
          </button>
        </>
      )}
    </main>
  );
}
export default function App() {
  const location = useLocation();
  useEffect(() => {
    document.title = location.pathname.startsWith('/app')
      ? 'Blocpod — Operating Network'
      : 'Blocpod — Build the system. Own the leverage.';
  }, [location.pathname]);
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Public />} />
        <Route path="/pricing" element={<Public />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/forgot-password" element={<Auth mode="forgot" />} />
        <Route path="/reset-password" element={<Auth mode="reset" />} />
        <Route path="/verify-email" element={<Verify />} />
        <Route path="/privacy" element={<Policy kind="privacy" />} />
        <Route path="/terms" element={<Policy kind="terms" />} />
        <Route element={<Protected />}>
          <Route path="/app" element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="intelligence" element={<Library intelligence />} />
            <Route path="library" element={<Library />} />
            <Route path="library/:id" element={<ResourceDetail />} />
            <Route path="build" element={<BuildQueue />} />
            <Route path="community" element={<Community />} />
            <Route path="workspace" element={<Workspace />} />
            <Route path="account" element={<Account />} />
            <Route
              path="billing"
              element={<Navigate to="/app/account" replace />}
            />
            <Route path="foundry" element={<Foundry />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="search" element={<Search />} />
            <Route path="help" element={<Help />} />
            <Route path="admin/*" element={<Admin />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <main className="policy-page">
              <p className="eyebrow">404 / A DIFFERENT PATH</p>
              <h1>This page isn’t here.</h1>
              <Link to="/" className="button primary">
                Return to Blocpod
              </Link>
            </main>
          }
        />
      </Routes>
    </Suspense>
  );
}
