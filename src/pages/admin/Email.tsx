import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  DateText,
  LoadState,
  send,
  Status,
  useAdmin,
  type Row,
} from './shared';

export default function Email() {
  const state = useAdmin('email');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const rows: Row[] = (state.data?.emails || []).filter(
    (r: Row) => filter === 'all' || r.status === filter,
  );
  async function retry(mail: Row) {
    setBusy(mail.id);
    setError('');
    setFeedback('');
    try {
      const result: any = await send(`email/${mail.id}/retry`, 'POST', {});
      const status = result.email?.status || result.status;
      if (status === 'failed' || status === 'blocked')
        setError(
          result.email?.last_error ||
            result.last_error ||
            `Delivery ${status}. Review the provider configuration and failure details.`,
        );
      else
        setFeedback(
          status === 'sent'
            ? `Email delivered to ${mail.recipient}.`
            : 'Delivery retry requested. Refresh the outbox to check its final status.',
        );
      await state.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to retry delivery.');
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <div className="admin-section-heading">
        <div>
          <h2>Email outbox</h2>
          <p className="muted">
            Delivery status for account and transactional messages.
          </p>
        </div>
        <button
          className="button"
          disabled={state.loading}
          onClick={() => void state.reload()}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      <p className="admin-notice">
        Retries use the configured email transport. Account links and message
        bodies are kept private.
      </p>
      <div className="admin-toolbar">
        <select
          aria-label="Filter email delivery status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All delivery states</option>
          {['pending', 'sending', 'sent', 'failed', 'blocked'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="admin-feedback" role="status">
          {feedback}
        </p>
      )}
      <LoadState {...state} empty={!rows.length} />
      {!state.loading && !state.error && rows.length > 0 && (
        <div className="admin-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Message</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Created / delivered</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((mail) => (
                <tr key={mail.id}>
                  <td>
                    <strong>{mail.subject}</strong>
                    <small>
                      {mail.recipient} · {mail.purpose}
                    </small>
                    {mail.last_error && (
                      <small className="admin-delivery-error">
                        {mail.last_error}
                      </small>
                    )}
                  </td>
                  <td>
                    <Status value={mail.status} />
                  </td>
                  <td>{mail.attempts || 0}</td>
                  <td>
                    <DateText value={mail.created_at} />
                    <small>
                      {mail.sent_at ? (
                        <DateText value={mail.sent_at} />
                      ) : (
                        'Not delivered'
                      )}
                    </small>
                  </td>
                  <td>
                    {['pending', 'failed', 'blocked'].includes(mail.status) && (
                      <button
                        className="button"
                        disabled={Boolean(busy)}
                        onClick={() => void retry(mail)}
                      >
                        {busy === mail.id ? 'Retrying…' : 'Retry delivery'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
