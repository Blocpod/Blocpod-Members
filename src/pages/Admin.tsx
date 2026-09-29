import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  Layers,
  Mail,
  MessageSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import Content from './admin/Content';
import { Members, Plans } from './admin/People';
import { BuildQueue, Opportunities } from './admin/Queue';
import Community from './admin/Community';
import Automation from './admin/Automation';
import Email from './admin/Email';
import { LoadState, useAdmin } from './admin/shared';
import './admin.css';

const tabs = [
  ['overview', 'Overview', ChartNoAxesCombined],
  ['members', 'Members', Users],
  ['content', 'Content', BookOpen],
  ['queue', 'Build Queue', Layers],
  ['community', 'Community', MessageSquare],
  ['opportunities', 'Opportunities', CircleDollarSign],
  ['automation', 'Automation', Bot],
  ['email', 'Email', Mail],
  ['plans', 'Entitlements', ShieldCheck],
] as const;

export default function Admin() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  if (loading) return <p role="status">Loading your permissions…</p>;
  if (!user || !['admin', 'staff', 'moderator'].includes(user.role))
    return (
      <div className="empty-state">
        <ShieldCheck size={26} />
        <h1>Staff access required</h1>
        <p>Your membership does not include administration access.</p>
      </div>
    );
  const available =
    user.role === 'moderator' ? tabs.filter((t) => t[0] === 'community') : tabs;
  const requested = params.get('tab') || 'overview';
  const active =
    available.find((t) => t[0] === requested)?.[0] || available[0][0];
  return (
    <div className="admin-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">BLOCPOD / CONTROL ROOM</p>
          <h1>
            Network operations<span className="admin-heading-dot">.</span>
          </h1>
          <p className="muted">
            The people, intelligence, and systems behind the network.
          </p>
        </div>
        <span className="admin-access">
          <ShieldCheck size={14} />
          {user.role} access
        </span>
      </header>
      <nav className="admin-tabs" aria-label="Administration sections">
        {available.map(([id, label, Icon]) => (
          <button
            key={id}
            className={active === id ? 'active' : ''}
            aria-current={active === id ? 'page' : undefined}
            onClick={() => setParams({ tab: id })}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      <section
        className="admin-tab-content"
        key={active}
        aria-label={available.find((t) => t[0] === active)?.[1]}
      >
        {active === 'overview' && (
          <Overview navigate={(tab) => setParams({ tab })} />
        )}
        {active === 'members' && <Members />}
        {active === 'content' && <Content />}
        {active === 'queue' && <BuildQueue />}
        {active === 'community' && (
          <Community moderationOnly={user.role === 'moderator'} />
        )}
        {active === 'opportunities' && <Opportunities />}
        {active === 'automation' && <Automation />}
        {active === 'plans' && <Plans />}
        {active === 'email' && <Email />}
      </section>
    </div>
  );
}

function Overview({ navigate }: { navigate: (tab: string) => void }) {
  const state = useAdmin('analytics');
  const stats = state.data?.stats;
  if (state.loading || state.error || !stats) return <LoadState {...state} />;
  const metrics = [
    [
      'Active memberships',
      stats.active_members,
      `${stats.members} member accounts`,
      'members',
    ],
    [
      'Published resources',
      stats.published_resources,
      'Approved network knowledge',
      'content',
    ],
    [
      'Open build requests',
      stats.open_requests,
      'Unmerged requests in progress',
      'queue',
    ],
    [
      'Foundry opportunities',
      stats.open_opportunities,
      'Awaiting a commercial outcome',
      'opportunities',
    ],
  ];
  return (
    <>
      <div className="admin-section-heading">
        <div>
          <span className="eyebrow">NETWORK PULSE</span>
          <h2>A clear view of what needs you.</h2>
        </div>
        <span className="admin-live-label">
          <Activity size={14} /> Live database totals
        </span>
      </div>
      <div className="admin-metrics">
        {metrics.map(([label, value, description, tab]) => (
          <button
            key={label}
            className="admin-metric"
            onClick={() => navigate(tab)}
          >
            <span>
              {label}
              <ArrowUpRight size={15} />
            </span>
            <strong>{Number(value || 0).toLocaleString()}</strong>
            <small>{description}</small>
          </button>
        ))}
      </div>
      <div className="admin-ops-line">
        <span>
          <strong>{stats.active_7d}</strong> active members in the last 7 days
        </span>
        <span>
          <strong>{stats.onboarded_members}</strong> onboarding profiles
          completed
        </span>
        <button onClick={() => navigate('community')}>
          <strong>{stats.open_reports}</strong> open moderation reports{' '}
          <ArrowUpRight size={13} />
        </button>
        <button onClick={() => navigate('automation')}>
          <strong>{stats.failed_jobs}</strong> failed executions{' '}
          <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="admin-overview-grid">
        <section>
          <h3>
            Product activity <span className="muted">/ last 30 days</span>
          </h3>
          <MetricBars
            items={(state.data?.events || []).map((r: any) => ({
              label: r.event.replaceAll('_', ' '),
              value: r.count,
            }))}
            empty="Product events will appear as members use the network."
          />
        </section>
        <section>
          <h3>Build demand</h3>
          <MetricBars
            items={(state.data?.demand || []).map((r: any) => ({
              label: r.cluster || 'Unclassified',
              value: r.count,
            }))}
            empty="Demand themes appear when members submit requests."
          />
        </section>
        <section>
          <h3>Most viewed resources</h3>
          {state.data?.popular_resources?.length ? (
            <ol className="admin-ranked-list">
              {state.data.popular_resources.map((r: any, i: number) => (
                <li key={`${r.title}-${i}`}>
                  <span>
                    <small>{String(i + 1).padStart(2, '0')}</small>
                    {r.title}
                  </span>
                  <strong>
                    {r.views}
                    <small> views</small>
                  </strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No resource views recorded yet.</p>
          )}
        </section>
        <section>
          <h3>Membership distribution</h3>
          <MetricBars
            items={(state.data?.plans || []).map((r: any) => ({
              label: r.plan_id || 'No plan',
              value: r.count,
            }))}
            empty="Membership distribution will appear after registration."
          />
        </section>
      </div>
    </>
  );
}

function MetricBars({
  items,
  empty,
}: {
  items: { label: string; value: number }[];
  empty: string;
}) {
  const max = Math.max(...items.map((i) => Number(i.value)), 1);
  return items.length ? (
    <ul className="admin-bars">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`}>
          <div>
            <span>{item.label}</span>
            <strong>{Number(item.value).toLocaleString()}</strong>
          </div>
          <div className="admin-bar-track" aria-hidden="true">
            <span style={{ width: `${(Number(item.value) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="muted">{empty}</p>
  );
}
