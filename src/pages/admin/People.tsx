import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import {
  DateText,
  Editor,
  Entitlements,
  Field,
  LoadState,
  send,
  Status,
  useAdmin,
  type Row,
} from './shared';

export function Members() {
  const { user } = useAuth();
  const state = useAdmin('members');
  const plans = useAdmin('plans');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const rows: Row[] = (state.data?.members || []).filter((m: Row) =>
    `${m.name} ${m.email} ${m.plan_id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="admin-section-heading">
        <div>
          <h2>Member directory</h2>
          <p className="muted">Membership, roles, and individual access.</p>
        </div>
        <span className="badge">
          {state.data?.members?.length || 0} members
        </span>
      </div>
      <div className="admin-toolbar">
        <input
          aria-label="Search members"
          type="search"
          placeholder="Search name, email, or plan…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <LoadState {...state} empty={!rows.length} />
      {!state.loading && !state.error && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    <small>{m.email}</small>
                  </td>
                  <td>{m.plan_id || 'No plan'}</td>
                  <td>{m.role}</td>
                  <td>
                    <Status value={m.membership_status} />
                  </td>
                  <td>
                    <DateText value={m.created_at} />
                  </td>
                  <td>
                    {user?.role === 'admin' ? (
                      <button className="button" onClick={() => setSelected(m)}>
                        Manage
                      </button>
                    ) : (
                      <span className="muted">Admin managed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <MemberEditor
          key={selected.id}
          member={selected}
          plans={plans.data?.plans || []}
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

function MemberEditor({
  member,
  plans,
  close,
  saved,
}: {
  member: Row;
  plans: Row[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Row>({
    ...member,
    entitlement_overrides: member.entitlement_overrides || {},
  });
  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Editor
      title={`Manage ${member.name}`}
      onClose={close}
      onSave={async () => {
        await send(`members/${member.id}`, 'PATCH', {
          role: draft.role,
          plan_id: draft.plan_id,
          membership_status: draft.membership_status,
          entitlement_overrides: draft.entitlement_overrides,
          notes: draft.notes || '',
        });
        await saved();
      }}
    >
      <p className="muted">{member.email}</p>
      <div className="form-grid">
        <Field label="Role">
          <select
            value={draft.role}
            onChange={(e) => set('role', e.target.value)}
          >
            {['member', 'moderator', 'staff', 'admin'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Membership plan">
          <select
            value={draft.plan_id || ''}
            onChange={(e) => set('plan_id', e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Membership state">
          <select
            value={draft.membership_status}
            onChange={(e) => set('membership_status', e.target.value)}
          >
            {[
              'inactive',
              'active',
              'trialing',
              'past_due',
              'canceled',
              'suspended',
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <p className="admin-notice">
        These controls grant product access. Billing subscriptions remain
        managed through the payment provider.
      </p>
      <h4>Entitlement overrides</h4>
      <p className="muted">
        Leave an override empty to inherit the plan’s current entitlement.
      </p>
      <Entitlements
        overrides
        value={draft.entitlement_overrides}
        onChange={(v) => set('entitlement_overrides', v)}
      />
      <Field label="Internal notes">
        <textarea
          rows={4}
          maxLength={10000}
          value={draft.notes || ''}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>
    </Editor>
  );
}

export function Plans() {
  const { user } = useAuth();
  const state = useAdmin('plans');
  const [selected, setSelected] = useState<Row | null>(null);
  const rows: Row[] = state.data?.plans || [];
  return (
    <>
      <div className="admin-section-heading">
        <div>
          <h2>Plans & entitlements</h2>
          <p className="muted">
            Configure the capabilities each membership unlocks.
          </p>
        </div>
      </div>
      <LoadState {...state} empty={!rows.length} />
      {!state.loading && !state.error && (
        <div className="admin-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Membership</th>
                <th>Monthly</th>
                <th>Annual</th>
                <th>Availability</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                  </td>
                  <td>
                    {p.monthly_price == null
                      ? 'By application'
                      : `$${Number(p.monthly_price).toLocaleString()}`}
                  </td>
                  <td>
                    {p.annual_price == null
                      ? '—'
                      : `$${Number(p.annual_price).toLocaleString()}`}
                  </td>
                  <td>
                    <Status value={p.active ? 'active' : 'inactive'} />
                  </td>
                  <td>
                    {user?.role === 'admin' ? (
                      <button className="button" onClick={() => setSelected(p)}>
                        Edit
                      </button>
                    ) : (
                      <span className="muted">Admin managed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <PlanEditor
          key={selected.id}
          plan={selected}
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
function PlanEditor({
  plan,
  close,
  saved,
}: {
  plan: Row;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Row>({
    ...plan,
    entitlements: plan.entitlements || {},
  });
  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Editor
      title={`Configure ${plan.name}`}
      onClose={close}
      onSave={async () => {
        await send(`plans/${plan.id}`, 'PATCH', {
          name: draft.name,
          description: draft.description,
          monthly_price: Number(draft.monthly_price),
          annual_price: Number(draft.annual_price),
          active: draft.active,
          entitlements: draft.entitlements,
        });
        await saved();
      }}
    >
      <Field label="Plan name">
        <input
          required
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>
      <Field label="Description">
        <textarea
          rows={3}
          value={draft.description || ''}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Monthly display price (USD)">
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={draft.monthly_price ?? ''}
            onChange={(e) =>
              set(
                'monthly_price',
                e.target.value === '' ? '' : Number(e.target.value),
              )
            }
          />
        </Field>
        <Field label="Annual display price (USD)">
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={draft.annual_price ?? ''}
            onChange={(e) =>
              set(
                'annual_price',
                e.target.value === '' ? '' : Number(e.target.value),
              )
            }
          />
        </Field>
      </div>
      <p className="admin-notice">
        Display pricing must match your configured payment provider prices
        before accepting payments.
      </p>
      <h4>Product entitlements</h4>
      <Entitlements
        value={draft.entitlements}
        onChange={(v) => set('entitlements', v)}
      />
      <label className="admin-check">
        <input
          type="checkbox"
          checked={Boolean(draft.active)}
          onChange={(e) => set('active', e.target.checked)}
        />{' '}
        Available to new members
      </label>
    </Editor>
  );
}
