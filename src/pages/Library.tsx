import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Markdown from '../components/RichContent';
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  Search,
  Download,
} from 'lucide-react';
import { useData, post } from '../lib/api';
import {
  PageHeading,
  Loading,
  ErrorMessage,
  Empty,
  ResourceCard,
  ResourceArt,
  SectionTitle,
} from '../components/UI';
export default function Library({
  intelligence = false,
  saved = false,
}: {
  intelligence?: boolean;
  saved?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = intelligence ? 'Intelligence' : params.get('category') || '';
  const { data, loading, error, reload } = useData(
    `/resources?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}${saved ? '&saved=1' : ''}`,
  );
  return (
    <>
      <PageHeading
        eyebrow={intelligence ? 'SIGNAL OVER NOISE' : 'YOUR OPERATING TOOLKIT'}
        title={
          saved
            ? 'Saved resources'
            : intelligence
              ? 'Intelligence'
              : 'The library'
        }
        description={
          intelligence
            ? 'Understand what’s changing. Know what to do next.'
            : 'Working knowledge. Reusable systems. Your next unfair advantage.'
        }
      />
      <div className="library-toolbar">
        <form
          className="search-field"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <Search size={18} />
          <input
            aria-label="Search resources"
            placeholder="Find a system, idea, or next step…"
            value={q}
            onChange={(e) =>
              setParams(
                (p) => {
                  p.set('q', e.target.value);
                  return p;
                },
                { replace: true },
              )
            }
          />
        </form>
        {!intelligence && (
          <div className="filter-tabs" aria-label="Resource categories">
            {[
              '',
              'Intelligence',
              'Agents',
              'Systems',
              'Build Kits',
              'Prompts',
              'Playbooks',
            ].map((cat) => (
              <button
                key={cat}
                className={category === cat ? 'active' : ''}
                onClick={() =>
                  setParams((p) => {
                    p.set('category', cat);
                    return p;
                  })
                }
              >
                {cat || 'Everything'}
              </button>
            ))}
          </div>
        )}
      </div>
      <ErrorMessage error={error} />
      {loading ? (
        <Loading />
      ) : data?.resources?.length ? (
        <>
          <div className="results-label">
            {data.resources.length} RESOURCES <span>Curated for action</span>
          </div>
          <div className="resource-grid">
            {data.resources.map((r: any, i: number) => (
              <ResourceCard
                key={r.id}
                resource={r}
                index={i}
                onSave={saved ? reload : undefined}
              />
            ))}
          </div>
        </>
      ) : (
        <Empty title={saved ? 'Make this space yours.' : 'No resources found.'}>
          {saved
            ? 'Save useful resources from the library. They’ll be here when you need them.'
            : 'Try a broader search or another category.'}
        </Empty>
      )}
    </>
  );
}
export function ResourceDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useData(`/resources/${id}`);
  const [feedback, setFeedback] = useState('');
  const save = async () => {
    try {
      await post(`/resources/${id}/save`);
      reload();
    } catch (e) {
      setFeedback((e as Error).message);
    }
  };
  if (loading) return <Loading />;
  if (error)
    return (
      <>
        <Link className="text-link" to="/app/library">
          <ArrowLeft size={15} />
          Back to the library
        </Link>
        <div className="locked-resource">
          <span className="eyebrow">MORE CAPABILITY AWAITS</span>
          <h1>Go a level deeper.</h1>
          <p>{error}</p>
          <Link to="/app/account" className="button primary">
            Explore membership <ArrowUpRight size={17} />
          </Link>
        </div>
      </>
    );
  const r = data?.resource;
  if (!r) return null;
  const download = () => {
    const blob = new Blob([r.body], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <article className="resource-detail">
      <Link className="text-link" to="/app/library">
        <ArrowLeft size={15} />
        Back to the library
      </Link>
      <div className="article-meta">
        <span className="eyebrow">{r.category}</span>
        <span>{r.reading_minutes || 6} MIN READ</span>
        {r.demo && <span className="badge">Demonstration content</span>}
      </div>
      <h1>{r.title}</h1>
      <p className="article-summary">{r.summary}</p>
      <div className="article-actions">
        <button className="button" onClick={save}>
          {r.saved ? <Check size={16} /> : <Bookmark size={16} />}{' '}
          {r.saved ? 'Saved to workspace' : 'Save resource'}
        </button>
        <button className="button" onClick={download}>
          <Download size={16} />
          Download Markdown
        </button>
        {r.external_url && (
          <a
            className="button"
            href={r.external_url}
            target="_blank"
            rel="noreferrer"
          >
            Open resource <ArrowUpRight size={16} />
          </a>
        )}
      </div>
      <ErrorMessage error={feedback} />
      <ResourceArt
        category={r.category}
        variant={r.category === 'Agents' ? 1 : 2}
      />
      <div className="prose">
        <Markdown>{r.body}</Markdown>
      </div>
      <div className="article-end">
        <span className="eyebrow">PUT THIS INTO PRACTICE</span>
        <h2>Your next move is the one that matters.</h2>
        <Link
          className="button primary"
          to={`/app/build?goal=${encodeURIComponent(`Help me implement ${r.title}`)}`}
        >
          Get help building this <ArrowUpRight size={16} />
        </Link>
      </div>
      {data.related?.length > 0 && (
        <>
          <SectionTitle>Keep building</SectionTitle>
          <div className="resource-grid">
            {data.related.map((r: any, i: number) => (
              <ResourceCard key={r.id} resource={r} index={i} />
            ))}
          </div>
        </>
      )}
    </article>
  );
}
