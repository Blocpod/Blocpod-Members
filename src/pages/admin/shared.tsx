import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { RefreshCw, Save, X } from 'lucide-react';
import { api } from '../../lib/api';

export type Row = Record<string, any> & { id: string };
export function useAdmin<T = Record<string, any>>(
  collection: string,
  enabled = true,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!hasLoaded.current) setLoading(true);
    setError('');
    try {
      setData(await api<T>(`/admin/${collection}`));
      hasLoaded.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load this section.');
    } finally {
      setLoading(false);
    }
  }, [collection, enabled]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}
export function send(path: string, method: string, body: unknown) {
  return api(`/admin/${path}`, { method, body: JSON.stringify(body) });
}
export function Status({ value }: { value?: string }) {
  return (
    <span className={`badge admin-status status-${value || 'unknown'}`}>
      {(value || 'unknown').replaceAll('_', ' ')}
    </span>
  );
}
export function DateText({ value }: { value?: string }) {
  return (
    <>
      {value
        ? new Date(value).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '—'}
    </>
  );
}
export function LoadState({
  loading,
  error,
  reload,
  empty,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
  empty?: boolean;
}) {
  if (error)
    return (
      <div className="error-message" role="alert">
        {error}{' '}
        <button className="button" onClick={reload}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  if (loading)
    return (
      <p className="muted" role="status">
        Loading records…
      </p>
    );
  if (empty)
    return (
      <div className="empty-state">
        No records yet. New activity will appear here.
      </div>
    );
  return null;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className="field">
      <span id={id}>{label}</span>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        ['input', 'select', 'textarea'].includes(String(child.type))
          ? cloneElement(child as ReactElement<Record<string, unknown>>, {
              'aria-labelledby': id,
              'aria-describedby': hint ? `${id}-hint` : undefined,
            })
          : child,
      )}
      {hint && (
        <small id={`${id}-hint`} className="muted">
          {hint}
        </small>
      )}
    </label>
  );
}
export function Editor({
  title,
  onClose,
  onSave,
  children,
  submitLabel = 'Save changes',
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<unknown>;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const origin =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    heading.current?.focus();
    return () => {
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, []);
  return (
    <section
      className="admin-editor panel"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !saving) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="admin-section-heading">
        <h3 ref={heading} tabIndex={-1}>
          {title}
        </h3>
        <button
          type="button"
          className="button"
          disabled={saving}
          aria-label="Close editor"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError('');
          try {
            await onSave();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Unable to save changes.',
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset disabled={saving}>{children}</fieldset>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="admin-editor-footer">
          <button type="submit" className="button primary" disabled={saving}>
            <Save size={15} />
            {saving ? 'Saving…' : submitLabel}
          </button>
          <button
            type="button"
            className="button"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
export const entitlementFields = [
  ['resource_level', 'Resource access level', 'number'],
  ['room_level', 'Room access level', 'number'],
  ['submissions_monthly', 'Build requests / month', 'number'],
  ['ai_monthly', 'AI requests / month', 'number'],
  ['voting', 'Build Queue voting', 'boolean'],
  ['private_spaces', 'Private spaces', 'boolean'],
  ['consultation', 'Consultation', 'boolean'],
  ['implementation', 'Implementation requests', 'boolean'],
] as const;
export function Entitlements({
  value,
  onChange,
  overrides = false,
}: {
  value: Record<string, number | boolean>;
  onChange: (value: Record<string, number | boolean>) => void;
  overrides?: boolean;
}) {
  return (
    <div className="form-grid">
      {entitlementFields.map(([key, label, type]) => (
        <Field key={key} label={label}>
          {type === 'boolean' ? (
            <select
              value={
                value[key] === undefined
                  ? overrides
                    ? ''
                    : 'false'
                  : String(value[key])
              }
              onChange={(e) => {
                const next = { ...value };
                if (e.target.value === '') delete next[key];
                else next[key] = e.target.value === 'true';
                onChange(next);
              }}
            >
              {overrides && <option value="">Use plan default</option>}
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          ) : (
            <input
              type="number"
              min="0"
              max={key.endsWith('_level') ? 4 : 100000}
              placeholder={overrides ? 'Use plan default' : '0'}
              value={value[key] === undefined ? '' : Number(value[key])}
              onChange={(e) => {
                const next = { ...value };
                if (e.target.value === '') delete next[key];
                else next[key] = Number(e.target.value);
                onChange(next);
              }}
            />
          )}
        </Field>
      ))}
    </div>
  );
}
export function toLocalInput(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
