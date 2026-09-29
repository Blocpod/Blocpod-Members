import { useRef, useState } from 'react';
import Markdown from '../../components/RichContent';
import { Bold, Code, Eye, Link, Plus } from 'lucide-react';
import {
  DateText,
  Editor,
  Field,
  LoadState,
  send,
  Status,
  toLocalInput,
  useAdmin,
  type Row,
} from './shared';

const categories = [
  'Intelligence',
  'Agents',
  'Systems',
  'Build kits',
  'Prompts',
  'Playbooks',
];
export default function Content() {
  const state = useAdmin('resources');
  const [selected, setSelected] = useState<Row | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const rows: Row[] = (state.data?.resources || []).filter(
    (r: Row) =>
      (status === 'all' || r.status === status) &&
      `${r.title} ${r.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="admin-section-heading">
        <div>
          <h2>Publishing desk</h2>
          <p className="muted">
            Edit, review, and release the network’s knowledge.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            setSelected({
              id: '',
              title: '',
              summary: '',
              body: '',
              category: 'Intelligence',
              tags: [],
              level: 1,
              status: 'draft',
              approved: false,
            })
          }
        >
          <Plus size={16} /> New resource
        </button>
      </div>
      <div className="admin-toolbar">
        <input
          aria-label="Search resources"
          type="search"
          placeholder="Search resources…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter publishing status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All publishing states</option>
          {['draft', 'review', 'scheduled', 'published', 'archived'].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
      </div>
      <LoadState {...state} empty={rows.length === 0} />
      {!state.loading && !state.error && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Access</th>
                <th>Status</th>
                <th>Updated</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    <small>
                      {r.category} · {(r.tags || []).join(', ')}
                    </small>
                  </td>
                  <td>Level {r.level}</td>
                  <td>
                    <Status value={r.status} />
                  </td>
                  <td>
                    <DateText value={r.updated_at || r.created_at} />
                  </td>
                  <td>
                    <button className="button" onClick={() => setSelected(r)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <ContentEditor
          key={selected.id || 'new'}
          resource={selected}
          close={() => setSelected(null)}
          saved={async () => {
            setSelected(null);
            await state.reload();
          }}
        />
      )}
    </>
  );
}

function ContentEditor({
  resource,
  close,
  saved,
}: {
  resource: Row;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Row>({
    ...resource,
    tags: (resource.tags || []).join(', '),
    publish_at: toLocalInput(resource.publish_at),
  });
  const [preview, setPreview] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  function insert(before: string, after: string) {
    const input = textarea.current;
    if (!input) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    set(
      'body',
      `${draft.body.slice(0, start)}${before}${draft.body.slice(start, end) || 'text'}${after}${draft.body.slice(end)}`,
    );
    input.focus();
  }
  return (
    <Editor
      title={resource.id ? 'Edit resource' : 'Create resource'}
      onClose={close}
      onSave={async () => {
        if (!draft.body.trim())
          throw new Error('Write the resource content before saving.');
        if (
          ['published', 'scheduled'].includes(draft.status) &&
          !draft.approved
        )
          throw new Error(
            'Approve the content before publishing or scheduling.',
          );
        if (
          draft.status === 'scheduled' &&
          (!draft.publish_at ||
            new Date(draft.publish_at).getTime() <= Date.now())
        )
          throw new Error('Choose a future publication time.');
        const payload = {
          title: draft.title,
          summary: draft.summary,
          body: draft.body,
          category: draft.category,
          tags: draft.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean),
          level: Number(draft.level),
          status: draft.status,
          approved: Boolean(draft.approved),
          publish_at: draft.publish_at
            ? new Date(draft.publish_at).toISOString()
            : null,
          external_url: draft.external_url || null,
        };
        await send(
          `resources${resource.id ? `/${resource.id}` : ''}`,
          resource.id ? 'PATCH' : 'POST',
          payload,
        );
        await saved();
      }}
    >
      <Field label="Title">
        <input
          required
          maxLength={200}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>
      <Field
        label="Public summary"
        hint="This description is visible before a member unlocks the resource."
      >
        <textarea
          required
          maxLength={1500}
          rows={3}
          value={draft.summary}
          onChange={(e) => set('summary', e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Category">
          <select
            value={draft.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {[...new Set([...categories, draft.category])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Access level">
          <select
            value={draft.level}
            onChange={(e) => set('level', Number(e.target.value))}
          >
            {['Operator', 'Builder', 'Founder', 'Foundry'].map((v, i) => (
              <option key={v} value={i + 1}>
                {i + 1} · {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Tags" hint="Separate tags with commas.">
        <input
          value={draft.tags}
          onChange={(e) => set('tags', e.target.value)}
        />
      </Field>
      <div className="admin-markdown-toolbar">
        <strong>Content</strong>
        <div>
          <button
            type="button"
            className="button"
            aria-label="Insert bold text"
            onClick={() => insert('**', '**')}
            disabled={preview}
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            className="button"
            aria-label="Insert code block"
            onClick={() => insert('\n```\n', '\n```\n')}
            disabled={preview}
          >
            <Code size={15} />
          </button>
          <button
            type="button"
            className="button"
            aria-label="Insert link"
            onClick={() => insert('[', '](https://example.com)')}
            disabled={preview}
          >
            <Link size={15} />
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            <Eye size={15} />
            {preview ? 'Write' : 'Preview'}
          </button>
        </div>
      </div>
      {preview ? (
        <div className="admin-markdown-preview prose">
          <Markdown>
            {draft.body || '*Your resource preview will appear here.*'}
          </Markdown>
        </div>
      ) : (
        <textarea
          ref={textarea}
          required
          aria-label="Markdown resource content"
          className="admin-content-input"
          rows={16}
          maxLength={150000}
          value={draft.body}
          onChange={(e) => set('body', e.target.value)}
        />
      )}
      <p className="muted admin-hint">
        Markdown supports headings, images, lists, links, and fenced code. Raw
        HTML is disabled.
      </p>
      <Field label="Repository, download, or related URL">
        <input
          type="url"
          placeholder="https://"
          value={draft.external_url || ''}
          onChange={(e) => set('external_url', e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Publishing state">
          <select
            value={draft.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {['draft', 'review', 'scheduled', 'published', 'archived'].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </Field>
        {draft.status === 'scheduled' && (
          <Field label="Publish at (your local time)">
            <input
              required
              type="datetime-local"
              value={draft.publish_at}
              onChange={(e) => set('publish_at', e.target.value)}
            />
          </Field>
        )}
      </div>
      <label className="admin-check">
        <input
          type="checkbox"
          checked={Boolean(draft.approved)}
          onChange={(e) => set('approved', e.target.checked)}
        />{' '}
        I have reviewed and approved this content for publication.
      </label>
    </Editor>
  );
}
