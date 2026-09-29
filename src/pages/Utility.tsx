import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowUpRight, CheckCheck, Search as SearchIcon } from 'lucide-react';
import { useData, patch } from '../lib/api';
import {
  PageHeading,
  ErrorMessage,
  Empty,
  Loading,
  timeAgo,
} from '../components/UI';
export function Notifications() {
  const { data, loading, error, reload } = useData('/notifications');
  const [actionError, setError] = useState('');
  const mark = async (id?: string) => {
    try {
      await patch('/notifications', id ? { id } : { all: true });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="STAY IN THE LOOP"
        title="Your updates"
        description="The things that matter to what you’re building."
        action={
          <button className="button" onClick={() => mark()}>
            <CheckCheck size={16} />
            Mark all as read
          </button>
        }
      />
      <ErrorMessage error={error || actionError} />
      {loading ? (
        <Loading />
      ) : data?.notifications?.length ? (
        <div className="notification-list">
          {data.notifications.map((n: any) => (
            <article key={n.id} className={!n.read_at ? 'unread' : ''}>
              <span className="notification-dot" />
              <div>
                <h3>{n.title}</h3>
                <p>{n.body}</p>
                <span className="tiny-label">{timeAgo(n.created_at)}</span>
              </div>
              <div>
                {n.href && (
                  <Link
                    className="icon-button"
                    to={n.href}
                    onClick={() => mark(n.id)}
                    aria-label={`Open ${n.title}`}
                  >
                    <ArrowUpRight size={18} />
                  </Link>
                )}
                {!n.read_at && (
                  <button
                    className="icon-button"
                    onClick={() => mark(n.id)}
                    aria-label="Mark as read"
                  >
                    <CheckCheck size={16} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="You’re all caught up.">
          Updates to your requests, resources, and membership will appear here.
        </Empty>
      )}
    </>
  );
}
export function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const { data, loading, error } = useData(
    `/search?q=${encodeURIComponent(q)}`,
  );
  return (
    <>
      <PageHeading
        eyebrow="YOUR NETWORK, CONNECTED"
        title="Find your next step"
        description="Search resources, ideas, and conversations you have access to."
      />
      <div className="search-field global-search">
        <SearchIcon size={20} />
        <input
          aria-label="Search everything"
          value={q}
          placeholder="What are you looking for?"
          onChange={(e) => setParams({ q: e.target.value }, { replace: true })}
        />
      </div>
      <ErrorMessage error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <div className="search-results">
            {['resources', 'requests', 'messages', 'projects'].map(
              (type) =>
                data[type]?.length > 0 && (
                  <section key={type}>
                    <h2>
                      {type === 'requests'
                        ? 'Build Queue'
                        : type === 'messages'
                          ? 'Conversations'
                          : type}
                    </h2>
                    {data[type].map((r: any) => (
                      <Link
                        key={r.id}
                        to={
                          type === 'resources'
                            ? `/app/library/${r.id}`
                            : type === 'requests'
                              ? '/app/build'
                              : type === 'messages'
                                ? `/app/community?room=${r.room_id}`
                                : '/app/workspace'
                        }
                      >
                        <div>
                          <h3>
                            {r.title ||
                              r.name ||
                              r.author_name ||
                              'Conversation'}
                          </h3>
                          <p>{r.summary || r.body || r.goal}</p>
                        </div>
                        <ArrowUpRight size={17} />
                      </Link>
                    ))}
                  </section>
                ),
            )}
            {!['resources', 'requests', 'messages', 'projects'].some(
              (type) => data[type]?.length,
            ) && (
              <Empty title={q ? 'No matches yet.' : 'What’s on your mind?'}>
                {q
                  ? 'Try a broader term. Results only include content you can access.'
                  : 'Search for a goal, system, or conversation.'}
              </Empty>
            )}
          </div>
        )
      )}
    </>
  );
}
export function Help() {
  return (
    <>
      <PageHeading
        eyebrow="A GOOD PLACE TO START"
        title="Make the network work for you."
        description="A few simple moves to get from ambition to action."
      />
      <div className="help-list">
        {[
          [
            '01',
            'Start with your goal',
            'Tell the network what you’re trying to accomplish. We’ll look for relevant resources and a path forward.',
            '/app',
          ],
          [
            '02',
            'Find something you can use',
            'Explore the library. Save useful systems and build a workspace around your next project.',
            '/app/library',
          ],
          [
            '03',
            'Bring the problem into the open',
            'Submit a Build Queue idea. Keep sensitive company context in the private fields.',
            '/app/build',
          ],
          [
            '04',
            'Build in good company',
            'Ask questions, share your progress, and meet people working through similar challenges.',
            '/app/community',
          ],
          [
            '05',
            'Know your access',
            'Your membership determines the resources, rooms, and tools you can use. Manage billing and profile from settings.',
            '/app/account',
          ],
        ].map(([n, t, d, to]) => (
          <Link key={n} to={to}>
            <span>{n}</span>
            <div>
              <h2>{t}</h2>
              <p>{d}</p>
            </div>
            <ArrowUpRight size={20} />
          </Link>
        ))}
      </div>
    </>
  );
}
export function Policy({ kind }: { kind: 'privacy' | 'terms' }) {
  return (
    <div className="policy-page">
      <Link to="/" className="text-link">
        ← Back to Blocpod
      </Link>
      <p className="eyebrow">
        PRODUCT PREVIEW ·{' '}
        {kind === 'privacy' ? 'DATA PRACTICES' : 'USE OF THE NETWORK'}
      </p>
      <h1>{kind === 'privacy' ? 'Privacy notice' : 'Terms of use'}</h1>
      <p className="muted">
        These describe the implementation’s current behavior. The operating
        company must review and finalize its legal policies and contact details
        before public launch.
      </p>
      <div className="prose">
        {kind === 'privacy' ? (
          <>
            <h2>What the platform stores</h2>
            <p>
              Your account details, membership state, profile, saved resources,
              project goals, Build Queue requests, community messages, and
              product interactions are stored to provide the service. Passwords
              are hashed; sessions are stored as hashed tokens.
            </p>
            <h2>Visibility and private information</h2>
            <p>
              Community messages are visible to members who can access their
              room. Build Queue titles and summaries may be visible to the
              network. Private business context and Foundry inquiries are
              available to authorized Blocpod staff. Private rooms require
              explicit membership.
            </p>
            <h2>External services</h2>
            <p>
              When configured, Stripe processes payments, an email provider
              delivers transactional messages, and AI providers process
              explicitly submitted workflow or goal content. Payment card
              details are not stored by this application.
            </p>
            <h2>Controls</h2>
            <p>
              You can update profile information and notification preferences in
              settings. Production operators must provide a verified privacy
              contact, retention schedule, and a process for account export and
              deletion before launch.
            </p>
          </>
        ) : (
          <>
            <h2>Membership</h2>
            <p>
              Paid access starts after a verified subscription event or an
              authorized manual grant. Features and usage limits are associated
              with your membership. Available billing changes and cancellations
              are managed in the provider’s secure portal.
            </p>
            <h2>Responsible participation</h2>
            <p>
              Respect other members, intellectual property, and confidential
              information. Do not submit abusive material, credentials, or
              information you do not have permission to share. Report concerns
              using the community report control.
            </p>
            <h2>AI and implementation</h2>
            <p>
              Review AI-generated material before using it. AI does not make
              binding commercial commitments. Custom implementation scope,
              pricing, service levels, and deliverables require a separate
              agreement with Blocpod.
            </p>
            <h2>Demonstration environment</h2>
            <p>
              Example content and accounts are labeled. A local preview is for
              evaluation and does not constitute a paid offering. Production
              operators must finalize company details, billing terms, support
              contacts, and applicable legal conditions before accepting real
              customers.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
