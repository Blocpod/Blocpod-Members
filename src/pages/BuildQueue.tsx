import { useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ArrowUp,
  ArrowUpRight,
  Plus,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { useData, post } from '../lib/api';
import {
  PageHeading,
  ErrorMessage,
  Empty,
  Loading,
  Status,
  timeAgo,
} from '../components/UI';
import { useAuth } from '../lib/auth';
export default function BuildQueue() {
  const [params] = useSearchParams();
  const [show, setShow] = useState(!!params.get('goal'));
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const { data, loading, error: loadError, reload } = useData('/requests');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const v = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await post('/requests', {
        title: v.title,
        summary: v.summary,
        context: {
          industry: v.industry,
          current_process: v.current_process,
          tools: v.tools,
          bottleneck: v.bottleneck,
          outcome: v.summary,
          urgency: v.urgency,
          links: String(v.links || '')
            .split(/[\s,]+/)
            .filter(Boolean),
        },
      });
      setShow(false);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const vote = async (id: string) => {
    setError('');
    try {
      await post(`/requests/${id}/vote`);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const requests =
    data?.requests?.filter(
      (r: any) => (!status || r.status === status) && (!mine || r.own),
    ) || [];
  return (
    <>
      <PageHeading
        eyebrow="MEMBER NEEDS → WORKING SYSTEMS"
        title="The Build Queue"
        description="The next thing we build could be the thing you need."
        action={
          <button className="button primary" onClick={() => setShow(!show)}>
            {show ? <X size={16} /> : <Plus size={16} />}{' '}
            {show ? 'Close request' : 'Submit an idea'}
          </button>
        }
      />
      <div className="queue-intro">
        <div>
          <span className="eyebrow">BUILT AROUND REAL PROBLEMS</span>
          <p>
            Share the outcome. Find an existing solution.
            <br />
            Help shape what comes next.
          </p>
        </div>
        <div className="queue-process">
          <span>
            <i>1</i>Submit
          </span>
          <span>
            <i>2</i>Connect
          </span>
          <span>
            <i>3</i>Build
          </span>
          <span>
            <i>4</i>Release
          </span>
        </div>
      </div>
      {show && (
        <section className="panel request-form">
          <h2>What would move your business forward?</h2>
          <p className="muted">
            The title and summary are visible to members. Your business context
            is shared only with Blocpod staff.
          </p>
          <form onSubmit={submit}>
            <label className="field">
              Give your idea a clear title
              <input
                name="title"
                required
                minLength={5}
                maxLength={150}
                defaultValue={params.get('goal') || ''}
                placeholder="An agent that qualifies inbound leads"
              />
            </label>
            <label className="field">
              The outcome you want · visible to the network
              <textarea
                name="summary"
                required
                minLength={15}
                maxLength={1500}
                rows={3}
                placeholder="What should the finished system do? Keep confidential details below."
              />
            </label>
            <div className="private-fields">
              <span className="eyebrow">PRIVATE BUSINESS CONTEXT</span>
              <div className="form-grid">
                <label className="field">
                  Industry
                  <input
                    name="industry"
                    maxLength={100}
                    placeholder="e.g. Construction"
                  />
                </label>
                <label className="field">
                  Existing tools
                  <input
                    name="tools"
                    maxLength={500}
                    placeholder="e.g. HubSpot, Gmail, Airtable"
                  />
                </label>
                <label className="field">
                  Current process
                  <input
                    name="current_process"
                    maxLength={2000}
                    placeholder="How does this work today?"
                  />
                </label>
                <label className="field">
                  Main bottleneck
                  <input
                    name="bottleneck"
                    maxLength={2000}
                    placeholder="Where does it slow down?"
                  />
                </label>
                <label className="field">
                  Urgency
                  <select name="urgency">
                    <option value="exploring">Exploring</option>
                    <option value="this_month">This month</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="field">
                  Supporting links
                  <input
                    name="links"
                    maxLength={1000}
                    placeholder="https://…"
                  />
                </label>
              </div>
            </div>
            <ErrorMessage error={error} />
            <button className="button primary" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit to the Build Queue'}
              <ArrowUpRight size={16} />
            </button>
          </form>
        </section>
      )}
      <div className="queue-toolbar">
        <div className="filter-tabs">
          {[
            ['', 'All ideas'],
            ['planned', 'Planned'],
            ['building', 'In progress'],
            ['completed', 'Released'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={status === v ? 'active' : ''}
              onClick={() => setStatus(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
          />
          <SlidersHorizontal size={15} />
          My requests
        </label>
      </div>
      <ErrorMessage error={loadError || (!show ? error : '')} />
      {loading ? (
        <Loading />
      ) : requests.length ? (
        <div className="build-list">
          {requests.map((r: any) => (
            <article key={r.id} className="build-row">
              <button
                onClick={() => vote(r.id)}
                className={`vote-button ${r.voted ? 'voted' : ''}`}
                aria-label={`${r.voted ? 'Remove vote from' : 'Vote for'} ${r.title}`}
                disabled={!user?.entitlements?.voting}
                title={
                  !user?.entitlements?.voting
                    ? 'Builder membership includes voting'
                    : undefined
                }
              >
                <ArrowUp size={17} />
                <strong>{r.votes || 0}</strong>
              </button>
              <div className="build-content">
                <div className="build-row-meta">
                  <Status value={r.status} />
                  <span>{r.classification?.replaceAll('_', ' ')}</span>
                  {r.own && <span>YOUR REQUEST</span>}
                </div>
                <h2>{r.title}</h2>
                <p>{r.summary}</p>
                {r.update_note && (
                  <div className="build-update">
                    <strong>Latest update</strong> {r.update_note}
                  </div>
                )}
                <span className="tiny-label">{timeAgo(r.created_at)}</span>
              </div>
              <ArrowUpRight size={18} className="muted" />
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            mine
              ? 'Your ideas belong here.'
              : 'A little room for your next idea.'
          }
        >
          Submit a problem you’d like to solve and track its progress here.
        </Empty>
      )}
      {!user?.entitlements?.voting && (
        <p className="upgrade-note">
          Builder members can vote on the next systems we build.{' '}
          <Link to="/app/account">
            Explore Builder <ArrowUpRight size={13} />
          </Link>
        </p>
      )}
    </>
  );
}
