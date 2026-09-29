import { useState } from 'react';
import { Play, Plus, RefreshCw } from 'lucide-react';
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

export default function Automation() {
  const state = useAdmin('workflows');
  const jobs = useAdmin('jobs');
  const [selected, setSelected] = useState<Row | null>(null);
  const [running, setRunning] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const rows: Row[] = state.data?.workflows || [];
  const jobRows: Row[] = jobs.data?.jobs || [];
  async function run(workflow: Row) {
    setRunning(workflow.id);
    setFeedback('');
    setError('');
    try {
      const result: any = await send(
        `workflows/${workflow.id}/run`,
        'POST',
        {},
      );
      const status = result.job?.status || result.status;
      if (result.error || status === 'failed')
        setError(
          result.error || 'Workflow execution failed. Review the job log.',
        );
      else
        setFeedback(
          result.skipped
            ? result.reason
            : status
              ? `${workflow.name}: ${status}. Review the execution log below.`
              : 'Execution requested. Review the execution log below.',
        );
      await Promise.all([jobs.reload(), state.reload()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to run workflow.');
      await jobs.reload();
    } finally {
      setRunning('');
    }
  }
  return (
    <>
      <div className="admin-section-heading">
        <div>
          <h2>Intelligence workflows</h2>
          <p className="muted">
            Scheduled research, editable drafts, and visible execution.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            setSelected({
              id: '',
              name: '',
              prompt: '',
              category: 'Intelligence',
              level: 1,
              provider: 'openai',
              model: '',
              schedule_minutes: 10080,
              enabled: false,
            })
          }
        >
          <Plus size={15} /> New workflow
        </button>
      </div>
      <p className="admin-notice">
        Generated resources enter human review. Provider credentials must be
        configured for a workflow to run successfully.
      </p>
      {feedback && (
        <p className="admin-feedback" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <LoadState {...state} empty={!rows.length} />
      {!state.loading && !state.error && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Schedule</th>
                <th>State</th>
                <th>Next run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <strong>{w.name}</strong>
                    <small>
                      {w.provider} · {w.model}
                    </small>
                  </td>
                  <td>
                    {Number(w.schedule_minutes) % 1440 === 0
                      ? `Every ${Number(w.schedule_minutes) / 1440} day(s)`
                      : `Every ${w.schedule_minutes} minutes`}
                  </td>
                  <td>
                    <Status value={w.enabled ? 'enabled' : 'paused'} />
                  </td>
                  <td>
                    {w.enabled ? <DateText value={w.next_run_at} /> : '—'}
                  </td>
                  <td>
                    <div className="admin-actions">
                      <button className="button" onClick={() => setSelected(w)}>
                        Edit
                      </button>
                      <button
                        className="button"
                        disabled={Boolean(running)}
                        onClick={() => void run(w)}
                      >
                        <Play size={13} />
                        {running === w.id ? 'Running…' : 'Run now'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <WorkflowEditor
          key={selected.id || 'new'}
          workflow={selected}
          close={() => setSelected(null)}
          saved={async () => {
            setSelected(null);
            await state.reload();
          }}
        />
      )}
      <div className="admin-section-heading admin-subsection">
        <div>
          <span className="eyebrow">EXECUTION HISTORY</span>
          <h2>Job log</h2>
        </div>
        <button
          className="button"
          onClick={() => void jobs.reload()}
          disabled={jobs.loading}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      <LoadState {...jobs} empty={!jobRows.length} />
      {!jobs.loading && !jobs.error && (
        <div className="admin-jobs">
          {jobRows.map((j) => (
            <details key={j.id} className="admin-job">
              <summary>
                <span>
                  <strong>
                    {j.workflow_name ||
                      j.name ||
                      j.kind ||
                      'Workflow execution'}
                  </strong>
                  <small>
                    <DateText value={j.created_at || j.started_at} />
                  </small>
                </span>
                <Status value={j.status} />
              </summary>
              <div className="admin-job-detail">
                <dl>
                  <dt>Execution</dt>
                  <dd>{j.id}</dd>
                  <dt>Provider / model</dt>
                  <dd>
                    {j.provider || '—'} / {j.model || '—'}
                  </dd>
                  <dt>Tokens</dt>
                  <dd>{j.tokens ?? 'Not reported'}</dd>
                  <dt>Completed</dt>
                  <dd>
                    <DateText value={j.finished_at || j.completed_at} />
                  </dd>
                  {j.cost != null && (
                    <>
                      <dt>Provider cost</dt>
                      <dd>${Number(j.cost).toFixed(4)}</dd>
                    </>
                  )}
                </dl>
                {j.error && <pre className="error-message">{j.error}</pre>}
                {(j.output || j.result || j.logs) && (
                  <pre className="admin-context">
                    {typeof (j.output || j.result || j.logs) === 'string'
                      ? j.output || j.result || j.logs
                      : JSON.stringify(j.output || j.result || j.logs, null, 2)}
                  </pre>
                )}
                {(j.resource_id || j.artifact_id) && (
                  <p className="muted">
                    Resource: {j.resource_id || j.artifact_id}. Review it in the
                    Content tab.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
function WorkflowEditor({
  workflow,
  close,
  saved,
}: {
  workflow: Row;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Row>({
    ...workflow,
    next_run_at: toLocalInput(workflow.next_run_at),
  });
  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Editor
      title={
        workflow.id ? `Edit ${workflow.name}` : 'Create editorial workflow'
      }
      onClose={close}
      onSave={async () => {
        await send(
          `workflows${workflow.id ? `/${workflow.id}` : ''}`,
          workflow.id ? 'PATCH' : 'POST',
          {
            name: draft.name,
            prompt: draft.prompt,
            category: draft.category,
            level: Number(draft.level),
            provider: draft.provider,
            model: draft.model,
            schedule_minutes: Number(draft.schedule_minutes),
            enabled: Boolean(draft.enabled),
            ...(draft.next_run_at
              ? { next_run_at: new Date(draft.next_run_at).toISOString() }
              : {}),
          },
        );
        await saved();
      }}
    >
      <Field label="Workflow name">
        <input
          required
          maxLength={160}
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>
      <Field
        label="Editorial instructions"
        hint="Describe the research question, audience, output structure, and evidence requirements."
      >
        <textarea
          required
          rows={9}
          maxLength={12000}
          value={draft.prompt}
          onChange={(e) => set('prompt', e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="AI provider">
          <select
            value={draft.provider}
            onChange={(e) => set('provider', e.target.value)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </Field>
        <Field label="Model ID">
          <input
            required
            placeholder="Configured provider model ID"
            value={draft.model}
            onChange={(e) => set('model', e.target.value)}
          />
        </Field>
        <Field label="Resource category">
          <select
            value={draft.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {[
              ...new Set([
                'Intelligence',
                'Agents',
                'Systems',
                'Build kits',
                'Prompts',
                'Playbooks',
                draft.category,
              ]),
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Resource access level">
          <select
            value={draft.level}
            onChange={(e) => set('level', Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((i) => (
              <option key={i} value={i}>
                Level {i}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Repeat interval (minutes)"
          hint="Minimum 15. Daily: 1440. Weekly: 10080."
        >
          <input
            type="number"
            min="15"
            max="525600"
            step="1"
            required
            value={draft.schedule_minutes}
            onChange={(e) => set('schedule_minutes', e.target.value)}
          />
        </Field>
        <Field label="Next run (your local time)">
          <input
            type="datetime-local"
            value={draft.next_run_at}
            onChange={(e) => set('next_run_at', e.target.value)}
          />
        </Field>
      </div>
      <label className="admin-check">
        <input
          type="checkbox"
          checked={Boolean(draft.enabled)}
          onChange={(e) => set('enabled', e.target.checked)}
        />{' '}
        Enable scheduled execution
      </label>
    </Editor>
  );
}
