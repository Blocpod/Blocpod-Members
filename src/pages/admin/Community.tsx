import { useState } from 'react';
import { Plus, ShieldAlert } from 'lucide-react';
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

export default function Community({
  moderationOnly = false,
}: {
  moderationOnly?: boolean;
}) {
  const state = useAdmin('rooms', !moderationOnly);
  const reports = useAdmin('reports');
  const members = useAdmin('members', !moderationOnly);
  const [selected, setSelected] = useState<Row | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const rows: Row[] = state.data?.rooms || [];
  const reportRows: Row[] = reports.data?.reports || [];
  async function moderate(id: string, status: string, action?: string) {
    if (
      action &&
      !window.confirm('Hide this reported message from the community?')
    )
      return;
    setBusy(id);
    setActionError('');
    try {
      await send(`reports/${id}`, 'PATCH', { status, action });
      await reports.reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Unable to update report.',
      );
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      {!moderationOnly && (
        <>
          <div className="admin-section-heading">
            <div>
              <h2>Community spaces</h2>
              <p className="muted">
                Manage room access and keep discussions useful.
              </p>
            </div>
            <button
              className="button primary"
              onClick={() =>
                setSelected({
                  id: '',
                  name: '',
                  description: '',
                  level: 1,
                  is_private: false,
                  members: [],
                })
              }
            >
              <Plus size={15} /> New room
            </button>
          </div>
          <LoadState {...state} empty={!rows.length} />
          {!state.loading && !state.error && rows.length > 0 && (
            <div className="admin-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Access</th>
                    <th>Visibility</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        <small>{r.description}</small>
                      </td>
                      <td>Level {r.level}</td>
                      <td>
                        <Status
                          value={r.is_private ? 'private' : 'community'}
                        />
                      </td>
                      <td>
                        <button
                          className="button"
                          onClick={() => setSelected(r)}
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selected && (
            <RoomEditor
              key={selected.id || 'new'}
              room={selected}
              members={members.data?.members || []}
              close={() => setSelected(null)}
              saved={async () => {
                setSelected(null);
                await state.reload();
              }}
            />
          )}
        </>
      )}
      <div className="admin-section-heading admin-subsection">
        <div>
          <span className="eyebrow">
            <ShieldAlert size={14} /> TRUST & SAFETY
          </span>
          <h2>Moderation reports</h2>
        </div>
      </div>
      {actionError && (
        <p className="error-message" role="alert">
          {actionError}
        </p>
      )}
      <LoadState {...reports} empty={!reportRows.length} />
      {!reports.loading && !reports.error && (
        <div className="admin-report-list">
          {reportRows.map((r) => (
            <article key={r.id} className="admin-report">
              <div className="admin-section-heading">
                <strong>{r.reason || 'Reported message'}</strong>
                <Status value={r.status} />
              </div>
              <blockquote>
                {r.message_body ||
                  r.body ||
                  r.message?.body ||
                  'Message unavailable'}
              </blockquote>
              <p className="muted">
                {r.reporter_name || 'Member report'} ·{' '}
                <DateText value={r.created_at} />
              </p>
              {r.status === 'open' && (
                <div className="admin-actions">
                  <button
                    className="button"
                    disabled={busy === r.id}
                    onClick={() =>
                      void moderate(r.id, 'resolved', 'hide_message')
                    }
                  >
                    Hide message & resolve
                  </button>
                  <button
                    className="button"
                    disabled={busy === r.id}
                    onClick={() => void moderate(r.id, 'resolved')}
                  >
                    Resolve
                  </button>
                  <button
                    className="button"
                    disabled={busy === r.id}
                    onClick={() => void moderate(r.id, 'dismissed')}
                  >
                    Dismiss report
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function RoomEditor({
  room,
  members,
  close,
  saved,
}: {
  room: Row;
  members: Row[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Row>({
    ...room,
    members: (room.members || []).map((m: string | Row) =>
      typeof m === 'string' ? m : m.user_id || m.id,
    ),
  });
  const [memberQuery, setMemberQuery] = useState('');
  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Editor
      title={room.id ? `Configure ${room.name}` : 'Create room'}
      onClose={close}
      onSave={async () => {
        await send(
          `rooms${room.id ? `/${room.id}` : ''}`,
          room.id ? 'PATCH' : 'POST',
          {
            name: draft.name,
            description: draft.description,
            level: Number(draft.level),
            is_private: Boolean(draft.is_private),
            organization_id: draft.organization_id || null,
            members: draft.members,
          },
        );
        await saved();
      }}
    >
      <Field label="Room name">
        <input
          required
          maxLength={100}
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>
      <Field label="Description">
        <textarea
          maxLength={1000}
          rows={3}
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>
      <Field label="Minimum room entitlement">
        <select
          value={draft.level}
          onChange={(e) => set('level', Number(e.target.value))}
        >
          {[1, 2, 3, 4].map((i) => (
            <option value={i} key={i}>
              Level {i}
            </option>
          ))}
        </select>
      </Field>
      <label className="admin-check">
        <input
          type="checkbox"
          checked={Boolean(draft.is_private)}
          onChange={(e) => set('is_private', e.target.checked)}
        />{' '}
        Private room · restrict access to invited members
      </label>
      <Field
        label="Organization ID (optional)"
        hint="Only members of this organization can access an organization-scoped room."
      >
        <input
          value={draft.organization_id || ''}
          onChange={(e) => set('organization_id', e.target.value)}
        />
      </Field>
      {draft.is_private && (
        <>
          <h4>Invited members</h4>
          <input
            type="search"
            aria-label="Search members to invite"
            placeholder="Find a member…"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
          />
          <div className="admin-member-picker">
            {members
              .filter((m) =>
                `${m.name} ${m.email}`
                  .toLowerCase()
                  .includes(memberQuery.toLowerCase()),
              )
              .map((m) => (
                <label className="admin-check" key={m.id}>
                  <input
                    type="checkbox"
                    checked={draft.members.includes(m.id)}
                    onChange={(e) =>
                      set(
                        'members',
                        e.target.checked
                          ? [...draft.members, m.id]
                          : draft.members.filter((id: string) => id !== m.id),
                      )
                    }
                  />
                  <span>
                    {m.name}
                    <small>{m.email}</small>
                  </span>
                </label>
              ))}
          </div>
          <p className="muted">
            {draft.members.length} invited members. Staff retain moderation
            access.
          </p>
        </>
      )}
    </Editor>
  );
}
