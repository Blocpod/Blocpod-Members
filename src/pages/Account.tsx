import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CreditCard,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useData, patch, post } from '../lib/api';
import { PageHeading, ErrorMessage, Loading, Status } from '../components/UI';
import { usePlans } from './Public';
export function Onboarding() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      const v = Object.fromEntries(new FormData(e.currentTarget));
      await patch('/auth/profile', {
        onboarded: true,
        profile: { ...user?.profile, ...v },
      });
      await refresh();
      navigate(
        params.get('plan') === 'foundry'
          ? '/app/foundry'
          : '/app/account?welcome=1',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="onboarding">
      <p className="eyebrow">MAKE THE NETWORK YOURS · 1 MINUTE</p>
      <h1>
        What are you
        <br />
        building toward?
      </h1>
      <p className="muted">
        A little context helps us connect you with the right systems and people.
        You can refine this anytime.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          Your role
          <select name="role">
            <option>Founder / business owner</option>
            <option>Operator / team leader</option>
            <option>Developer / builder</option>
            <option>Exploring what’s next</option>
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            Company <span className="muted">(optional)</span>
            <input name="company" maxLength={100} />
          </label>
          <label className="field">
            Industry
            <input
              name="industry"
              maxLength={100}
              placeholder="e.g. Professional services"
            />
          </label>
        </div>
        <label className="field">
          What are you trying to accomplish?
          <textarea
            name="goal"
            rows={3}
            required
            minLength={10}
            maxLength={2000}
            placeholder="I want to automate…"
          />
        </label>
        <label className="field">
          How comfortable are you with building software?
          <select name="technical_ability">
            <option>Business first — I want working systems</option>
            <option>Comfortable with no-code and automation</option>
            <option>I write and deploy code</option>
          </select>
        </label>
        <ErrorMessage error={error} />
        <button className="button primary" disabled={busy}>
          {busy ? 'Personalizing…' : 'Make it mine'}
          <ArrowRight size={17} />
        </button>
      </form>
    </div>
  );
}
export default function Account() {
  const plans = usePlans();
  const { user, refresh, billing_configured } = useAuth();
  const { data, loading } = useData('/billing/status');
  const [params] = useSearchParams();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [interval, setInterval] = useState('monthly');
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const v = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await patch('/auth/profile', {
        name: v.name,
        profile: {
          ...user?.profile,
          company: v.company,
          industry: v.industry,
          goal: v.goal,
          email_notifications: v.email_notifications === 'on',
        },
      });
      await refresh();
      setMessage('Your profile has been updated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const billing = async (plan?: string) => {
    setBusy(true);
    setError('');
    try {
      const d = await post(
        plan ? '/billing/checkout' : '/billing/portal',
        plan ? { plan_id: plan, interval } : {},
      );
      if (d.url) window.location.assign(d.url);
      else
        throw new Error(
          'Billing did not return a secure link. Please try again.',
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR ACCOUNT. YOUR POSSIBILITIES."
        title="Settings & membership"
        description="Keep your profile relevant and your access clear."
      />
      {params.has('welcome') && (
        <div className="success-panel">
          Your profile is ready. Choose a membership below to activate your
          access.
        </div>
      )}
      {params.get('checkout') === 'complete' && (
        <div className="success-panel">
          Your checkout was returned by the billing provider. Access updates
          after the verified payment event arrives. Refresh to check your
          status.
        </div>
      )}
      {!user?.email_verified && (
        <div className="verification-notice">
          <div>
            <strong>Verify your email address.</strong>
            <p>
              Check your inbox before starting a paid membership. You can resend
              the link here.
            </p>
          </div>
          <button
            className="button"
            onClick={async () => {
              try {
                await post('/auth/resend-verification');
                setMessage('Verification email queued. Check your inbox.');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Resend verification <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      <div className="account-grid">
        <section className="panel">
          <div className="section-title">
            <h2>
              <Settings size={18} />
              Your profile
            </h2>
          </div>
          <form onSubmit={save}>
            <label className="field">
              Name
              <input
                name="name"
                defaultValue={user?.name}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <label className="field">
              Email
              <input value={user?.email || ''} disabled />
            </label>
            <div className="form-grid">
              <label className="field">
                Company
                <input
                  name="company"
                  defaultValue={
                    user?.profile?.company || user?.profile?.business_name || ''
                  }
                  maxLength={100}
                />
              </label>
              <label className="field">
                Industry
                <input
                  name="industry"
                  defaultValue={user?.profile?.industry || ''}
                  maxLength={100}
                />
              </label>
            </div>
            <label className="field">
              Your current goal
              <textarea
                name="goal"
                defaultValue={user?.profile?.goal || ''}
                rows={3}
                maxLength={2000}
              />
            </label>
            <label className="checkbox-label">
              <input
                name="email_notifications"
                type="checkbox"
                defaultChecked={user?.profile?.email_notifications !== false}
              />
              Email me relevant network updates
            </label>
            <p className="small-print">
              Security and billing notices remain enabled.
            </p>
            <button className="button primary" disabled={busy}>
              Save changes
              <Check size={16} />
            </button>
            {message && (
              <p role="status" className="success-text">
                {message}
              </p>
            )}
          </form>
        </section>
        <section className="membership-panel">
          <span className="eyebrow">
            <CreditCard size={15} /> YOUR MEMBERSHIP
          </span>
          <h2>{user?.plan_id || 'Operator'}</h2>
          <Status value={user?.membership_status || 'pending'} />
          <p>
            {user?.membership_status === 'active'
              ? 'Your systems, intelligence, and network are ready when you are.'
              : 'Choose your membership to open up the network.'}
          </p>
          {loading ? (
            <Loading />
          ) : (
            <>
              <div className="membership-detail">
                <span>Billing provider</span>
                <strong>
                  {billing_configured ? 'Stripe' : 'Not configured'}
                </strong>
              </div>
              {data?.subscription?.current_period_end && (
                <div className="membership-detail">
                  <span>Current period ends</span>
                  <strong>
                    {new Date(
                      data.subscription.current_period_end,
                    ).toLocaleDateString()}
                  </strong>
                </div>
              )}
            </>
          )}
          {billing_configured ? (
            <button
              className="button"
              disabled={busy}
              onClick={() => billing()}
            >
              Manage billing & invoices <ArrowUpRight size={16} />
            </button>
          ) : (
            <p className="configuration-notice">
              Payments are not connected in this environment. You can explore
              plan capabilities below; no payment will be collected.
            </p>
          )}
          <Link className="text-link" to="/forgot-password">
            Reset your password <ArrowUpRight size={15} />
          </Link>
        </section>
      </div>
      <ErrorMessage error={error} />
      <div className="section-title membership-section">
        <div>
          <p className="eyebrow">GROW YOUR CAPABILITY</p>
          <h2>Your next level</h2>
        </div>
        <div className="filter-tabs">
          <button
            className={interval === 'monthly' ? 'active' : ''}
            onClick={() => setInterval('monthly')}
          >
            Monthly
          </button>
          <button
            className={interval === 'annual' ? 'active' : ''}
            onClick={() => setInterval('annual')}
          >
            Annual · 2 months included
          </button>
        </div>
      </div>
      <div className="pricing-grid account-pricing">
        {plans.map((p) => (
          <article
            key={p.id}
            className={p.id === user?.plan_id ? 'current-plan' : ''}
          >
            <p className="eyebrow">{p.name}</p>
            <h3>{p.verb}</h3>
            <div className="price">
              <strong>
                $
                {interval === 'annual' && p.id !== 'foundry'
                  ? p.annual
                  : p.price}
              </strong>
              <span>
                /{' '}
                {interval === 'annual' && p.id !== 'foundry' ? 'year' : 'month'}
              </span>
            </div>
            <ul>
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={14} />
                  {f}
                </li>
              ))}
            </ul>
            {p.id === 'foundry' ? (
              <Link className="button" to="/app/foundry">
                Explore Foundry <ArrowUpRight size={15} />
              </Link>
            ) : p.id === user?.plan_id &&
              user?.membership_status === 'active' ? (
              <span className="button selected-plan">
                <Check size={15} />
                Your current plan
              </span>
            ) : (
              <button
                className="button"
                disabled={busy || !billing_configured}
                onClick={() =>
                  billing(
                    data?.has_customer &&
                      ['active', 'trialing', 'past_due'].includes(
                        user?.membership_status || '',
                      )
                      ? undefined
                      : p.id,
                  )
                }
              >
                {billing_configured
                  ? data?.has_customer
                    ? 'Manage plan'
                    : 'Choose ' + p.name
                  : 'Payments not connected'}
                <ArrowUpRight size={15} />
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
export function Foundry() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/foundry', Object.fromEntries(new FormData(e.currentTarget)));
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="foundry-hero">
        <span className="eyebrow">
          <Sparkles size={15} /> BLOCPOD FOUNDRY
        </span>
        <h1>
          Some things deserve
          <br />
          <span>a deeper partnership.</span>
        </h1>
        <p>
          For the systems that are specific to your business. The integrations
          that need real engineering. The ideas worth building together.
        </p>
        <div>
          <span>Custom agents</span>
          <span>Internal applications</span>
          <span>Implementation</span>
        </div>
      </div>
      <div className="foundry-grid">
        <section>
          <p className="eyebrow">FROM AMBITION TO IMPLEMENTATION</p>
          <h2>
            Bring us the problem.
            <br />
            We’ll find the right starting point.
          </h2>
          <p className="muted">
            Your inquiry is private. Blocpod reviews scope, fit, and the best
            route forward before any commercial commitment.
          </p>
          <ol className="foundry-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Share the context.</h3>
                <p>Tell us what works today and what needs to change.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Find the leverage.</h3>
                <p>
                  We review existing systems, constraints, and possibilities.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Define the engagement.</h3>
                <p>Scope, pricing, and delivery are agreed with a human.</p>
              </div>
            </li>
          </ol>
        </section>
        <section className="panel">
          {done ? (
            <div className="success-panel">
              <Check size={28} />
              <h2>Your inquiry is with Blocpod.</h2>
              <p>
                You’ll receive an in-app update as your request progresses. No
                engagement or payment has been committed.
              </p>
              <Link to="/app/notifications" className="text-link">
                View your updates <ArrowUpRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2>Let’s start a conversation.</h2>
              <label className="field">
                Company
                <input
                  name="company"
                  defaultValue={user?.profile?.company || ''}
                  required
                  minLength={2}
                  maxLength={200}
                />
              </label>
              <label className="field">
                What do you want to accomplish?
                <textarea
                  name="goal"
                  rows={4}
                  required
                  minLength={20}
                  maxLength={5000}
                />
              </label>
              <label className="field">
                Systems, teams, or integrations involved
                <textarea name="scope" rows={2} maxLength={3000} />
              </label>
              <div className="form-grid">
                <label className="field">
                  Indicative budget
                  <select name="budget">
                    <option>Still exploring</option>
                    <option>$1,000–$5,000</option>
                    <option>$5,000–$25,000</option>
                    <option>$25,000–$100,000</option>
                    <option>$100,000+</option>
                  </select>
                </label>
                <label className="field">
                  Timeline
                  <select name="timeline">
                    <option>Exploring</option>
                    <option>This month</option>
                    <option>This quarter</option>
                    <option>Flexible</option>
                  </select>
                </label>
              </div>
              <ErrorMessage error={error} />
              <button className="button primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send private inquiry'}
                <ArrowUpRight size={16} />
              </button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
