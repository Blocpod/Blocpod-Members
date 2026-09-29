import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Plus,
  Layers3,
  Workflow,
  ScanLine,
  Command,
} from 'lucide-react';
import { Logo } from '../components/UI';
import { useData } from '../lib/api';
export const plans = [
  {
    id: 'operator',
    name: 'Operator',
    price: '49',
    verb: 'See what’s next.',
    description: 'Turn emerging intelligence into your next advantage.',
    features: [
      'Weekly actionable intelligence',
      'Playbooks, prompts & resources',
      'Selected tools & community access',
    ],
  },
  {
    id: 'builder',
    name: 'Builder',
    price: '179',
    verb: 'Make it work.',
    description: 'Move from knowing what’s possible to shipping it.',
    features: [
      'Everything in Operator',
      'Agents, workflows & complete build kits',
      'Technical rooms & Build Queue voting',
    ],
  },
  {
    id: 'founder',
    name: 'Founder',
    price: '499',
    verb: 'Build with conviction.',
    description: 'Better decisions, with Blocpod in your corner.',
    features: [
      'Everything in Builder',
      'Architecture feedback & office hours',
      'Priority requests & deeper research',
    ],
  },
  {
    id: 'foundry',
    name: 'Foundry',
    price: '1,000+',
    verb: 'Go further, together.',
    description: 'A direct path to custom systems and implementation.',
    features: [
      'Everything in Founder',
      'Private implementation workspace',
      'Custom scope, agreed with our team',
    ],
  },
];
export function usePlans() {
  const { data } = useData('/billing/plans');
  return data?.plans
    ? plans
        .filter((p) => data.plans.some((r: any) => r.id === p.id))
        .map((p) => {
          const row = data.plans.find((r: any) => r.id === p.id);
          return {
            ...p,
            name: row.name,
            price:
              row.monthly_price === null
                ? '1,000+'
                : String(Number(row.monthly_price)),
            annual: row.annual_price === null ? null : Number(row.annual_price),
          };
        })
    : plans.map((p) => ({
        ...p,
        annual: p.id === 'foundry' ? null : Number(p.price) * 10,
      }));
}
export default function Public() {
  const catalog = usePlans();
  return (
    <div className="public-site">
      <header className="public-nav">
        <Link to="/" aria-label="Blocpod home">
          <Logo />
        </Link>
        <nav aria-label="Main">
          <a href="#network">The network</a>
          <a href="#how-it-works">How it works</a>
          <a href="#membership">Membership</a>
        </nav>
        <div>
          <Link className="login-link" to="/login">
            Member login
          </Link>
          <Link className="button small primary" to="/register">
            Get access <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main>
        <section className="public-hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="live-dot" /> THE BLOCPOD OPERATING NETWORK
            </p>
            <h1>
              Build the system.
              <br />
              <span>Own the leverage.</span>
            </h1>
            <p className="hero-description">
              The intelligence, tools, and people to turn what’s next into what
              you do. Put AI to work in your business.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#membership">
                Find your membership <ArrowUpRight size={18} />
              </a>
              <a className="text-link" href="#network">
                Explore the network <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-caption">
              <span>FOR FOUNDERS. BUILDERS. OPERATORS.</span>
              <span>BUILT BY BLOCPOD ↗</span>
            </div>
          </div>
          <div
            className="system-visual"
            aria-label="Intelligence, systems, and execution connected in one operating network"
          >
            <div className="visual-label">
              <span className="live-dot" /> A NEW WAY TO OPERATE
              <span>01—04</span>
            </div>
            <div className="system-stack">
              <div className="system-layer layer-one">
                <ScanLine />
                <span>INTELLIGENCE</span>
                <small>Understand the opportunity</small>
              </div>
              <div className="system-layer layer-two">
                <Layers3 />
                <span>SYSTEMS</span>
                <small>Build your advantage</small>
              </div>
              <div className="system-layer layer-three">
                <Workflow />
                <span>EXECUTION</span>
                <small>Put it into motion</small>
              </div>
            </div>
            <div className="visual-bottom">
              <span>
                HUMAN AMBITION.
                <br />
                SYSTEMS THAT MULTIPLY IT.
              </span>
              <Command size={22} />
            </div>
          </div>
        </section>
        <div className="value-strip">
          <span>Less noise. More capability.</span>
          <p>
            Understand <ArrowRight /> Build <ArrowRight /> Deploy <ArrowRight />{' '}
            Go further
          </p>
        </div>
        <section className="public-section" id="network">
          <div className="section-intro">
            <p className="eyebrow">YOUR OPERATING ADVANTAGE</p>
            <h2>
              Everything you need.
              <br />
              <span>Connected to what you’re building.</span>
            </h2>
            <p>
              Good information is everywhere. The ability to use it is what
              separates you. Blocpod connects the insight to the system to the
              people who can help.
            </p>
          </div>
          <div className="network-grid">
            {[
              [
                '01',
                'Intelligence that moves you.',
                'Signal translated into action. Opportunities, market shifts, and technical developments with a clear answer to “what does this mean for my business?”',
                'INTELLIGENCE',
                ScanLine,
              ],
              [
                '02',
                'Systems you can actually use.',
                'Agents, workflows, prompts, and complete build kits. Start with working patterns and a clear implementation path.',
                'THE LIBRARY',
                Layers3,
              ],
              [
                '03',
                'Your problem. Our next build.',
                'Tell us what you need. Find an existing solution, combine the right tools, or help shape what Blocpod builds next.',
                'BUILD QUEUE',
                Workflow,
              ],
            ].map(([n, title, desc, label, Icon]) => {
              const I = Icon as typeof ScanLine;
              return (
                <article key={n as string}>
                  <div className="network-icon">
                    <I size={28} />
                    <span>{n as string}</span>
                  </div>
                  <h3>{title as string}</h3>
                  <p>{desc as string}</p>
                  <span className="eyebrow">
                    {label as string}
                    <ArrowUpRight size={16} />
                  </span>
                </article>
              );
            })}
          </div>
        </section>
        <section className="outcome-section" id="how-it-works">
          <div>
            <p className="eyebrow">START WITH AN OUTCOME</p>
            <h2>
              “What are you trying
              <br />
              to accomplish?”
            </h2>
            <p>
              One question opens the right doors. Your network connects the goal
              to resources, community knowledge, and a path to implementation.
            </p>
            <Link className="text-link" to="/register">
              Bring your next idea <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="outcome-flow">
            <div className="goal-example">
              <span className="avatar">You</span>
              <p>I want to automate customer qualification.</p>
              <ArrowUpRight size={20} />
            </div>
            <div className="flow-line" />
            <div className="flow-result">
              <span className="tiny-label">YOUR PATH FORWARD</span>
              <h3>Start with the qualification system.</h3>
              <p>
                Connect a reusable workflow, an implementation blueprint, and
                people building similar systems.
              </p>
              <div>
                <span>01 / Discover</span>
                <span>02 / Build</span>
                <span>03 / Deploy</span>
              </div>
            </div>
            <p className="example-label">ILLUSTRATIVE MEMBER JOURNEY</p>
          </div>
        </section>
        <section className="public-section memberships" id="membership">
          <div className="section-intro">
            <p className="eyebrow">CHOOSE YOUR LEVEL OF LEVERAGE</p>
            <h2>
              One network.
              <br />
              <span>A bigger range of possibilities.</span>
            </h2>
            <p>
              Start where you are. Grow into what’s next. Monthly memberships,
              with clear capabilities at every level.
            </p>
          </div>
          <div className="pricing-grid">
            {catalog.map((plan) => (
              <article
                key={plan.id}
                className={plan.id === 'builder' ? 'featured-plan' : ''}
              >
                {plan.id === 'builder' && (
                  <span className="plan-recommendation">
                    FOR PEOPLE READY TO BUILD
                  </span>
                )}
                <p className="eyebrow">{plan.name}</p>
                <h3>{plan.verb}</h3>
                <p className="plan-description">{plan.description}</p>
                <div className="price">
                  <strong>${plan.price}</strong>
                  <span>/ month</span>
                </div>
                <Link
                  className={`button ${plan.id === 'builder' ? 'primary' : ''}`}
                  to={
                    plan.id === 'foundry'
                      ? '/register?plan=foundry'
                      : `/register?plan=${plan.id}`
                  }
                >
                  {plan.id === 'foundry'
                    ? 'Explore Foundry'
                    : `Join ${plan.name}`}
                  <ArrowUpRight size={16} />
                </Link>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>
                      <Check size={15} />
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="pricing-note">
            Foundry engagements are scoped individually. Membership starts after
            payment or approved access. No commercial commitment is made by AI.
          </p>
        </section>
        <section className="public-section faq">
          <div>
            <p className="eyebrow">A FEW GOOD QUESTIONS</p>
            <h2>Clarity comes first.</h2>
          </div>
          <div>
            {[
              [
                'Is this a course?',
                'Blocpod is an operating network: intelligence, reusable systems, a native community, and a path to implementation. You can learn here, but the point is what you can accomplish.',
              ],
              [
                'Do I need to be technical?',
                'Operator is built for people making business decisions. Builder adds hands-on technical resources. Founder and Foundry add access to human judgment and scoped implementation support.',
              ],
              [
                'What if my problem needs a custom build?',
                'Describe it in the Build Queue or submit a private Foundry inquiry. We look for existing solutions first, then review whether community development or a scoped engagement makes sense.',
              ],
              [
                'Can I change my membership?',
                'Yes. Billing settings open the secure billing portal where you can manage your subscription and available plan changes. Foundry scope and pricing are agreed with our team.',
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing-section">
          <p className="eyebrow">YOUR NEXT ADVANTAGE STARTS HERE</p>
          <h2>
            More than knowing.
            <br />
            <span>Now, doing.</span>
          </h2>
          <a href="#membership" className="button primary">
            Enter the network <ArrowUpRight size={18} />
          </a>
        </section>
      </main>
      <footer className="public-footer">
        <Link to="/">
          <Logo />
        </Link>
        <p>AI systems for people who actually build.</p>
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/login">
            Member login <ArrowUpRight size={13} />
          </Link>
        </div>
        <small>
          © {new Date().getFullYear()} Blocpod. Built for what’s next.
        </small>
      </footer>
    </div>
  );
}
