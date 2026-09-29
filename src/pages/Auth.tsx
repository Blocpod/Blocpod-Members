import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { post } from '../lib/api';
import { ErrorMessage, Logo } from '../components/UI';
export default function Auth({
  mode,
}: {
  mode: 'login' | 'register' | 'forgot' | 'reset';
}) {
  const { demo, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await post(
        `/auth/${mode === 'forgot' ? 'forgot-password' : mode === 'reset' ? 'reset-password' : mode}`,
        { ...values, token: params.get('token') },
      );
      if (mode === 'forgot' || mode === 'reset') setDone(true);
      else {
        await refresh();
        navigate(
          mode === 'register'
            ? `/app/onboarding?plan=${params.get('plan') || 'operator'}`
            : '/app',
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const demoLogin = async (role: string) => {
    setBusy(true);
    setError('');
    try {
      await post('/auth/demo', { role });
      await refresh();
      navigate(role === 'admin' ? '/app/admin' : '/app');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const titles = {
    login: 'Welcome back.',
    register: 'Your next chapter starts here.',
    forgot: 'Let’s get you back in.',
    reset: 'A fresh start.',
  };
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link to="/">
          <Logo />
        </Link>
        <div>
          <p className="eyebrow">THE BLOCPOD OPERATING NETWORK</p>
          <h1>
            Ambition,
            <br />
            meet capability.
          </h1>
          <p>
            Your intelligence. Your systems.
            <br />
            Your unfair advantage.
          </p>
        </div>
        <span className="eyebrow">BUILD THE SYSTEM. OWN THE LEVERAGE.</span>
      </div>
      <main className="auth-main">
        <Link className="text-link auth-back" to="/">
          Back to Blocpod <ArrowUpRight size={16} />
        </Link>
        <div className="auth-form">
          <p className="eyebrow">
            {mode === 'register' ? 'JOIN THE NETWORK' : 'MEMBER ACCESS'}
          </p>
          <h2>{titles[mode]}</h2>
          <p className="muted">
            {mode === 'login'
              ? 'Good to see you. Let’s get back to building.'
              : mode === 'register'
                ? 'Create your account, then choose your level of access.'
                : 'Keep your account and your work secure.'}
          </p>
          {done ? (
            <div className="success-panel" role="status">
              {mode === 'forgot'
                ? 'If an account exists, you’ll receive a password reset email. Check your inbox.'
                : 'Password updated. You can now sign in.'}
              <Link className="text-link" to="/login">
                Return to login <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              {mode === 'register' && (
                <label className="field">
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="How should we call you?"
                  />
                </label>
              )}
              {mode !== 'reset' && (
                <label className="field">
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@company.com"
                  />
                </label>
              )}
              {mode !== 'forgot' && (
                <label className="field">
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    minLength={mode === 'login' ? 1 : 12}
                    maxLength={128}
                    required
                    placeholder={
                      mode === 'login'
                        ? 'Enter your password'
                        : 'At least 12 characters'
                    }
                  />
                </label>
              )}
              <ErrorMessage error={error} />
              <button
                disabled={busy}
                className="button primary full"
                type="submit"
              >
                {busy
                  ? 'One moment…'
                  : mode === 'register'
                    ? 'Create your account'
                    : mode === 'login'
                      ? 'Enter the network'
                      : mode === 'forgot'
                        ? 'Send reset link'
                        : 'Update password'}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {mode === 'login' && (
            <div className="auth-links">
              <Link to="/forgot-password">Forgot password?</Link>
              <Link to="/register">Create an account</Link>
            </div>
          )}
          {mode === 'register' && (
            <p className="small-print">
              By creating an account, you accept the{' '}
              <Link to="/terms">Terms</Link> and{' '}
              <Link to="/privacy">Privacy notice</Link>. Already a member?{' '}
              <Link to="/login">Sign in</Link>.
            </p>
          )}
          {demo && mode === 'login' && (
            <div className="demo-access">
              <p className="eyebrow">LOCAL PRODUCT PREVIEW</p>
              <p>
                Explore with a demonstration account. All example content is
                labeled.
              </p>
              <div>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => demoLogin('member')}
                >
                  Member preview <ArrowUpRight size={15} />
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => demoLogin('admin')}
                >
                  Admin preview <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
