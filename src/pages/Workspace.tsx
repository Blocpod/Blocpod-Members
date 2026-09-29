import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Plus, Boxes, Bookmark } from 'lucide-react';
import { useData, post } from '../lib/api';
import {
  PageHeading,
  ErrorMessage,
  Loading,
  Empty,
  ResourceCard,
  SectionTitle,
  Status,
} from '../components/UI';
export default function Workspace() {
  const { data, loading, error, reload } = useData('/projects');
  const saved = useData('/resources?saved=1');
  const [show, setShow] = useState(false);
  const [errorMessage, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = new FormData(form);
    setBusy(true);
    try {
      await post('/projects', {
        name: v.get('name'),
        goal: v.get('goal'),
        resource_ids: v.getAll('resource_ids'),
      });
      setShow(false);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="LESS STARTING OVER. MORE MOVING FORWARD."
        title="Your workspace"
        description="Keep the systems and ideas that matter close."
        action={
          <button className="button primary" onClick={() => setShow(!show)}>
            <Plus size={16} />
            New project
          </button>
        }
      />
      {show && (
        <form className="panel project-form" onSubmit={create}>
          <h2>Give your next build a home.</h2>
          <div className="form-grid">
            <label className="field">
              Project name
              <input name="name" required minLength={3} maxLength={120} />
            </label>
            <label className="field">
              The goal
              <input name="goal" required minLength={10} maxLength={2000} />
            </label>
          </div>
          {saved.data?.resources?.length > 0 && (
            <fieldset>
              <legend>Combine saved resources</legend>
              {saved.data.resources.map((r: any) => (
                <label className="checkbox-label" key={r.id}>
                  <input name="resource_ids" type="checkbox" value={r.id} />
                  {r.title}
                </label>
              ))}
            </fieldset>
          )}
          <ErrorMessage error={errorMessage} />
          <button className="button primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
            <ArrowUpRight size={16} />
          </button>
        </form>
      )}
      <SectionTitle>Your active projects</SectionTitle>
      <ErrorMessage error={error} />
      {loading ? (
        <Loading />
      ) : data?.projects?.length ? (
        <div className="project-grid">
          {data.projects.map((p: any) => (
            <article key={p.id} className="project-card">
              <div>
                <Boxes size={21} />
                <Status value={p.status} />
              </div>
              <h3>{p.name}</h3>
              <p>{p.goal}</p>
              {p.resource_ids?.length > 0 ? (
                <div className="project-assets">
                  <span className="eyebrow">CONNECTED SYSTEMS</span>
                  {p.resource_ids.map((id: string) => (
                    <Link key={id} to={`/app/library/${id}`}>
                      {saved.data?.resources?.find((r: any) => r.id === id)
                        ?.title || 'Open resource'}
                      <ArrowUpRight size={14} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Link className="text-link" to="/app/library">
                  Discover a system <ArrowUpRight size={15} />
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title="A home for what you’re building.">
          Create a project around a goal and connect the resources you’ve saved.
        </Empty>
      )}
      <SectionTitle to="/app/library" label="Explore resources">
        Saved for your next move
      </SectionTitle>
      {saved.loading ? (
        <Loading />
      ) : saved.data?.resources?.length ? (
        <div className="resource-grid">
          {saved.data.resources.map((r: any, i: number) => (
            <ResourceCard
              key={r.id}
              resource={r}
              index={i}
              onSave={saved.reload}
            />
          ))}
        </div>
      ) : (
        <div className="saved-empty">
          <Bookmark size={22} />
          <p>Spot something useful? Save it in the library and find it here.</p>
          <Link className="text-link" to="/app/library">
            Find your next resource <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
    </>
  );
}
