import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  DateText,
  Editor,
  Field,
  LoadState,
  send,
  Status,
  useAdmin,
  type Row,
} from './shared';

export function BuildQueue() {
  const state = useAdmin('requests');
  const members = useAdmin('members');
  const resources = useAdmin('resources');
  const [selected, setSelected] = useState<Row | null>(null);
  const [filter, setFilter] = useState('all');
  const rows: Row[] = (state.data?.requests || []).filter(
    (r: Row) => filter === 'all' || r.status === filter,
  );
  return (
    <>
      <div className="admin-section-heading">
        <div>
          <h2>Build Queue operations</h2>
          <p className="muted">Turn member demand into reusable systems.</p>
        </div>
        <select
          aria-label="Filter Build Queue"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All requests</option>
          {[
            'submitted',
            'reviewing',
            'planned',
            'building',
            'completed',
            'declined',
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <LoadState {...state} empty={!rows.length} />
      {!state.loading && !state.error && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Votes</th>
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
                      {r.classification || 'Awaiting classification'}
                    </small>
                  </td>
                  <td>
                    <Status value={r.status} />
                  </td>
                  <td>{r.priority ?? 0}</td>
                  <td>{r.vote_count ?? r.votes ?? 0}</td>
                  <td>
                    <button className="button" onClick={() => setSelected(r)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <RequestEditor
          key={selected.id}
          request={selected}
          requests={state.data?.requests || []}
          staff={(members.data?.members || []).filter((m: Row) =>
            ['admin', 'staff', 'moderator'].includes(m.role),
          )}
          resources={resources.data?.resources || []}
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

function RequestEditor({
  request,
  requests,
  staff,
  resources,
  close,
  saved,
}: {
  request: Row;
  requests: Row[];
  staff: Row[];
  resources: Row[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Row>({ ...request });
  const [target, setTarget] = useState('');
  const [mergeError, setMergeError] = useState('');
  const [merging, setMerging] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [triageError, setTriageError] = useState('');
  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Editor
      title={request.title}
      onClose={close}
      onSave={async () => {
        await send(`requests/${request.id}`, 'PATCH', {
          title: draft.title,
          summary: draft.summary,
          classification: draft.classification,
          priority: Number(draft.priority),
          status: draft.status,
          assigned_to: draft.assigned_to || null,
          update_note: draft.update_note || '',
          resource_id: draft.resource_id || null,
        });
        await saved();
      }}
    >
      <p>{request.summary}</p>
      {request.context && (
        <details>
          <summary>Member’s private context</summary>
          <pre className="admin-context">
            {typeof request.context === 'string'
              ? request.context
              : JSON.stringify(request.context, null, 2)}
          </pre>
        </details>
      )}
      <div className="admin-ai-review">
        <div className="admin-section-heading">
          <div>
            <h4>AI triage</h4>
            <p className="muted">
              Only public request details are sent to the configured provider.
            </p>
          </div>
          <button
            type="button"
            className="button"
            disabled={triaging}
            onClick={async () => {
              setTriaging(true);
              setTriageError('');
              try {
                const result: any = await send(
                  `requests/${request.id}/triage`,
                  'POST',
                  {},
                );
                if (result.analysis) set('ai_analysis', result.analysis);
                set('ai_state', result.state);
                if (result.dispatch_error)
                  setTriageError(result.dispatch_error);
              } catch (e) {
                setTriageError(
                  e instanceof Error ? e.message : 'Triage failed.',
                );
              } finally {
                setTriaging(false);
              }
            }}
          >
            {triaging ? 'Analyzing…' : 'Run AI triage'}
          </button>
        </div>
        {triageError && (
          <p role="alert" className="error-message">
            {triageError}
          </p>
        )}
        {draft.ai_analysis ? (
          <pre className="admin-context">{draft.ai_analysis}</pre>
        ) : (
          <p className="muted">
            {draft.ai_state === 'unconfigured'
              ? 'Configure an AI provider to generate a reviewable analysis.'
              : `Analysis state: ${draft.ai_state || 'not run'}`}
          </p>
        )}
      </div>
      <div className="form-grid">
        <Field label="Status">
          <select
            value={draft.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {[
              'submitted',
              'reviewing',
              'planned',
              'building',
              'completed',
              'declined',
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority" hint="Higher values receive higher priority.">
          <input
            type="number"
            min="0"
            max="100"
            value={draft.priority ?? 0}
            onChange={(e) => set('priority', e.target.value)}
          />
        </Field>
        <Field label="Classification">
          <input
            maxLength={120}
            list="request-classifications"
            value={draft.classification || ''}
            onChange={(e) => set('classification', e.target.value)}
          />
          <datalist id="request-classifications">
            {[
              'existing_resource',
              'configuration',
              'extension',
              'community_tool',
              'product_opportunity',
              'foundry_opportunity',
            ].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Assigned to">
          <select
            value={draft.assigned_to || ''}
            onChange={(e) => set('assigned_to', e.target.value)}
          >
            <option value="">Unassigned</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Public progress update"
        hint="Members can see this update on the request."
      >
        <textarea
          rows={4}
          maxLength={10000}
          value={draft.update_note || ''}
          onChange={(e) => set('update_note', e.target.value)}
        />
      </Field>
      <Field label="Attach completed resource">
        <select
          value={draft.resource_id || ''}
          onChange={(e) => set('resource_id', e.target.value)}
        >
          <option value="">No linked resource</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} ({r.status})
            </option>
          ))}
        </select>
      </Field>
      <details className="admin-merge">
        <summary>Merge duplicate request</summary>
        <p className="muted">
          Merge this request into an existing request. Save any pending edits
          first.
        </p>
        <Field label="Destination request">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose request</option>
            {requests
              .filter((r) => r.id !== request.id && !r.merged_into)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
          </select>
        </Field>
        <button
          type="button"
          className="button"
          disabled={!target || merging}
          onClick={async () => {
            if (
              !window.confirm(
                'Merge this request into the selected request? The destination will become the canonical request.',
              )
            )
              return;
            setMerging(true);
            setMergeError('');
            try {
              await send(`requests/${request.id}/merge`, 'POST', {
                target_id: target,
              });
              await saved();
            } catch (e) {
              setMergeError(e instanceof Error ? e.message : 'Merge failed.');
            } finally {
              setMerging(false);
            }
          }}
        >
          {merging ? 'Merging…' : 'Merge request'}
          <ArrowUpRight size={14} />
        </button>
        {mergeError && (
          <p className="error-message" role="alert">
            {mergeError}
          </p>
        )}
      </details>
    </Editor>
  );
}

export function Opportunities() {
  const state = useAdmin('opportunities');
  const [selected, setSelected] = useState<Row | null>(null);
  const rows: Row[] = state.data?.opportunities || [];
  return (
    <>
      <div className="admin-section-heading">
        <div>
          <h2>Foundry pipeline</h2>
          <p className="muted">
            Review commercial signals before making commitments.
          </p>
        </div>
      </div>
      <LoadState {...state} empty={!rows.length} />
      {!state.loading && !state.error && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Status</th>
                <th>Potential value</th>
                <th>Received</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>
                      {o.title || o.company || 'Foundry application'}
                    </strong>
                    <small>
                      {o.member_name ||
                        o.member_email ||
                        o.name ||
                        o.email ||
                        o.user_name}
                    </small>
                  </td>
                  <td>
                    <Status value={o.status} />
                  </td>
                  <td>
                    {o.value_estimate
                      ? `$${Number(o.value_estimate).toLocaleString()}`
                      : 'Unqualified'}
                  </td>
                  <td>
                    <DateText value={o.created_at} />
                  </td>
                  <td>
                    <button className="button" onClick={() => setSelected(o)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <OpportunityEditor
          key={selected.id}
          opportunity={selected}
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
function OpportunityEditor({
  opportunity,
  close,
  saved,
}: {
  opportunity: Row;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Row>({ ...opportunity });
  return (
    <Editor
      title={opportunity.title || 'Review opportunity'}
      onClose={close}
      onSave={async () => {
        await send(`opportunities/${opportunity.id}`, 'PATCH', {
          status: draft.status,
          notes: draft.notes || '',
          value_estimate:
            draft.value_estimate === '' || draft.value_estimate == null
              ? null
              : Number(draft.value_estimate),
        });
        await saved();
      }}
    >
      <p>
        {opportunity.summary || opportunity.goal || opportunity.description}
      </p>
      {(opportunity.scope || opportunity.budget || opportunity.timeline) && (
        <dl className="admin-opportunity-context">
          <dt>Scope</dt>
          <dd>{opportunity.scope || 'Not specified'}</dd>
          <dt>Budget</dt>
          <dd>{opportunity.budget || 'Not specified'}</dd>
          <dt>Timeline</dt>
          <dd>{opportunity.timeline || 'Not specified'}</dd>
        </dl>
      )}
      {opportunity.context && (
        <pre className="admin-context">
          {typeof opportunity.context === 'string'
            ? opportunity.context
            : JSON.stringify(opportunity.context, null, 2)}
        </pre>
      )}
      <div className="form-grid">
        <Field label="Opportunity stage">
          <select
            value={draft.status}
            onChange={(e) =>
              setDraft((d) => ({ ...d, status: e.target.value }))
            }
          >
            {['new', 'reviewing', 'qualified', 'closed'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Estimated value (USD)">
          <input
            type="number"
            min="0"
            step="1"
            value={draft.value_estimate ?? ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, value_estimate: e.target.value }))
            }
          />
        </Field>
      </div>
      <Field label="Internal notes" hint="Only staff can read these notes.">
        <textarea
          rows={7}
          maxLength={12000}
          value={draft.notes || ''}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
      </Field>
    </Editor>
  );
}
