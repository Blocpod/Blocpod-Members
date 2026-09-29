import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  ArrowUp,
  Layers3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { useData, post } from '../lib/api';
import {
  ErrorMessage,
  Loading,
  ResourceCard,
  SectionTitle,
  Status,
} from '../components/UI';
export function GoalRouter() {
  const [goal, setGoal] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!goal.trim()) return;
    setBusy(true);
    setError('');
    try {
      setResult(await post('/route-goal', { goal }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="goal-panel">
      <div className="goal-header">
        <span className="eyebrow">
          <Sparkles size={14} /> YOUR AMBITION. A PATH FORWARD.
        </span>
        <span className="tiny-label">START HERE ↗</span>
      </div>
      <h2>What are you trying to accomplish?</h2>
      <p>Find the right intelligence, systems, and people to make it happen.</p>
      <form onSubmit={submit}>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          maxLength={2000}
          minLength={10}
          required
          aria-label="What are you trying to accomplish?"
          placeholder="I want to automate customer qualification…"
        />
        <button type="submit" disabled={busy} className="button primary">
          {busy ? 'Finding your path…' : 'Find my path'}
          <ArrowUpRight size={17} />
        </button>
      </form>
      <div className="goal-suggestions">
        <span>EXPLORE</span>
        {[
          'Automate my sales process',
          'Build an AI product',
          'Run AI locally',
        ].map((s) => (
          <button key={s} onClick={() => setGoal(s)}>
            {s}
            <Plus size={12} />
          </button>
        ))}
      </div>
      <ErrorMessage error={error} />
      {result && (
        <div className="goal-result" aria-live="polite">
          <div>
            <span className="badge">{result.route?.replaceAll('_', ' ')}</span>
            <small>
              {result.method === 'keyword_rules'
                ? 'Matched from your network library'
                : 'AI-assisted guidance'}
            </small>
          </div>
          <p>{result.explanation}</p>
          {result.resources?.map((r: any) => (
            <Link key={r.id} to={`/app/library/${r.id}`}>
              {r.title}
              <ArrowUpRight size={16} />
            </Link>
          ))}
          <Link
            to={
              result.route === 'foundry'
                ? '/app/foundry'
                : `/app/build?goal=${encodeURIComponent(goal)}`
            }
            className="text-link"
          >
            {result.resources?.length
              ? 'Need something more specific?'
              : 'Take the next step'}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </section>
  );
}
export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useData('/dashboard');
  return (
    <>
      <div className="dashboard-greeting">
        <div>
          <p className="eyebrow">YOUR NEXT ADVANTAGE</p>
          <h1>
            Let’s build, {user?.name?.split(' ')[0]}
            <span className="accent">.</span>
          </h1>
          <p className="muted">A little intelligence. A lot of possibility.</p>
        </div>
        <div className="dashboard-date">
          <span>
            {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
          </span>
          <strong>
            {new Date().toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </strong>
        </div>
      </div>
      <GoalRouter />
      <ErrorMessage error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="dashboard-stats">
              {[
                [
                  'Saved resources',
                  data.stats?.saved_resources,
                  '/app/workspace',
                ],
                [
                  'Active projects',
                  data.stats?.active_projects,
                  '/app/workspace',
                ],
                ['Open requests', data.stats?.open_requests, '/app/build'],
                [
                  'Unread updates',
                  data.stats?.unread_notifications,
                  '/app/notifications',
                ],
              ].map(([label, value, to]) => (
                <Link to={String(to)} key={String(label)}>
                  <span>{label}</span>
                  <strong>
                    {value ?? 0}
                    <ArrowUpRight size={16} />
                  </strong>
                </Link>
              ))}
            </div>
            <SectionTitle to="/app/library" label="Explore the library">
              Your next move
            </SectionTitle>
            <p className="section-subtitle">
              {data.recommendation_reason ||
                'Fresh perspectives. Practical systems. A place to start.'}
            </p>
            <div className="resource-grid">
              {data.resources?.slice(0, 3).map((r: any, i: number) => (
                <ResourceCard resource={r} index={i} key={r.id} />
              ))}
            </div>
            <div className="dashboard-bottom">
              <section>
                <SectionTitle to="/app/build">
                  Inside the Build Queue
                </SectionTitle>
                <p className="muted section-subtitle">
                  Real problems. Shared momentum.
                </p>
                <div className="queue-preview">
                  {data.requests?.slice(0, 3).map((r: any) => (
                    <Link to="/app/build" key={r.id}>
                      <span className="vote-mini">
                        <ArrowUp size={14} />
                        {r.votes || 0}
                      </span>
                      <div>
                        <h3>{r.title}</h3>
                        <Status value={r.status} />
                      </div>
                      <ArrowUpRight size={17} />
                    </Link>
                  ))}
                  {!data.requests?.length && (
                    <p className="muted">
                      Your next idea could shape the network. Share it in the
                      Build Queue.
                    </p>
                  )}
                </div>
              </section>
              <section className="community-callout">
                <div className="eyebrow">
                  <Layers3 size={17} /> BUILT TOGETHER
                </div>
                <h2>
                  Your people.
                  <br />
                  Your next breakthrough.
                </h2>
                <p>
                  Swap what works, work through a problem, and build alongside
                  people moving in the same direction.
                </p>
                <Link className="text-link" to="/app/community">
                  Step into the conversation <ArrowUpRight size={17} />
                </Link>
              </section>
            </div>
          </>
        )
      )}
    </>
  );
}
