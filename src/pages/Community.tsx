import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Hash,
  MessageSquare,
  Send,
  Reply,
  Flag,
  SmilePlus,
  X,
  RefreshCw,
  AtSign,
} from 'lucide-react';
import { api, post, useData } from '../lib/api';
import {
  PageHeading,
  Loading,
  ErrorMessage,
  Empty,
  timeAgo,
} from '../components/UI';
import Modal from '../components/Modal';
const encodeMentions = (
  text: string,
  people: { id: string; name: string }[],
) => {
  if (!people.length) return text;
  const names = people
    .map((p) => p.name)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.replace(
    new RegExp(`@(${names.join('|')})(?=\\s|$|[.,!?])`, 'g'),
    (_, name: string) =>
      `@[${name}](user:${people.find((p) => p.name === name)!.id})`,
  );
};
const displayBody = (text: string) =>
  text.replace(/@\[([^\]]+)\]\(user:[^)]+\)/g, '@$1');
export default function Community() {
  const { data, loading, error } = useData('/rooms');
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [reply, setReply] = useState<any>(null);
  const [sendError, setSendError] = useState('');
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [participants, setParticipants] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [mentioned, setMentioned] = useState<{ id: string; name: string }[]>(
    [],
  );
  const list = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const olderLoaded = useRef(false);
  const initialLoad = useRef(true);
  const receive = (d: any) => {
    const bottom = list.current
      ? list.current.scrollHeight -
          list.current.scrollTop -
          list.current.clientHeight <
        100
      : true;
    setMessages((current) => {
      if (!olderLoaded.current) return d.messages;
      const boundary = current.findIndex((m) => m.id === d.messages[0]?.id);
      return [
        ...(boundary >= 0
          ? current.slice(0, boundary)
          : current.filter(
              (m) => m.created_at < (d.messages[0]?.created_at || ''),
            )),
        ...d.messages,
      ];
    });
    if (!olderLoaded.current) setNextCursor(d.next_cursor);
    if (initialLoad.current || bottom)
      requestAnimationFrame(() => {
        if (list.current) list.current.scrollTop = list.current.scrollHeight;
      });
    initialLoad.current = false;
  };
  const room =
    data?.rooms?.find((r: any) => r.id === params.get('room')) ||
    data?.rooms?.find((r: any) => !r.locked);
  const id = room?.id;
  const refresh = async () => {
    if (!id || room.locked) return;
    try {
      const d = await api(`/rooms/${id}/messages`);
      receive(d);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    olderLoaded.current = false;
    initialLoad.current = true;
    setNextCursor(null);
    setParticipants(null);
    setMessages([]);
    setReady(false);
    setReply(null);
    let active = true;
    const load = async () => {
      if (!id || room?.locked) return;
      try {
        const d = await api(`/rooms/${id}/messages`);
        if (active) {
          receive(d);
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      } finally {
        if (active) setReady(true);
      }
    };
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [id, room?.locked]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setSendError('');
    try {
      await post(`/rooms/${id}/messages`, {
        body: encodeMentions(body, mentioned),
        parent_id: reply?.id,
      });
      setBody('');
      setMentioned([]);
      setReply(null);
      await refresh();
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const react = async (message: any, emoji = '👍') => {
    try {
      await post(`/messages/${message.id}/reaction`, { emoji });
      await refresh();
    } catch (e) {
      setSendError((e as Error).message);
    }
  };
  const reportMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await post(`/messages/${report}/report`, {
        reason: new FormData(e.currentTarget).get('reason'),
      });
      setReport(null);
      setSendError('Report submitted to the moderation team.');
    } catch (e) {
      setSendError((e as Error).message);
    }
  };
  const earlier = async () => {
    if (!nextCursor) return;
    setBusy(true);
    try {
      const d = await api(
        `/rooms/${id}/messages?before=${encodeURIComponent(nextCursor)}`,
      );
      const h = list.current?.scrollHeight || 0;
      olderLoaded.current = true;
      setMessages((m) => [...d.messages, ...m]);
      setNextCursor(d.next_cursor);
      requestAnimationFrame(() => {
        if (list.current)
          list.current.scrollTop = list.current.scrollHeight - h;
      });
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const mention = async () => {
    if (participants) {
      setParticipants(null);
      return;
    }
    try {
      const d = await api(`/rooms/${id}/participants`);
      setParticipants(d.participants);
    } catch (e) {
      setSendError((e as Error).message);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="GOOD PEOPLE. BETTER POSSIBILITIES."
        title="The community"
        description="Build in good company."
      />
      <ErrorMessage error={error} />
      {loading ? (
        <Loading />
      ) : (
        <div className="community-layout">
          <aside className="room-list">
            <span className="eyebrow">YOUR ROOMS</span>
            {data?.rooms?.map((r: any) => (
              <button
                key={r.id}
                className={id === r.id ? 'active' : ''}
                onClick={() => setParams({ room: r.id })}
              >
                <Hash size={16} />
                <span>
                  {r.name}
                  {r.locked && <small>Explore access</small>}
                </span>
                {r.unread_count > 0 && (id !== r.id || !ready) && (
                  <b>{r.unread_count}</b>
                )}
              </button>
            ))}
            <div className="room-etiquette">
              <MessageSquare size={20} />
              <h3>Make it useful.</h3>
              <p>
                Share what you’ve tried. Be generous with context. Keep private
                business details in private rooms.
              </p>
            </div>
          </aside>
          <section className="conversation">
            {room ? (
              <>
                <header className="conversation-header">
                  <div>
                    <h2>
                      <Hash size={18} />
                      {room.name}
                    </h2>
                    <p>{room.description}</p>
                  </div>
                  <span className="connection-state">
                    <i className={connected ? 'live-dot' : 'offline-dot'} />
                    {connected ? 'Updates every 5s' : 'Reconnecting'}
                  </span>
                </header>
                {room.locked ? (
                  <Empty title="There’s a seat for you here.">
                    <span>
                      This room is included at a higher membership level.
                    </span>
                    <Link className="button primary" to="/app/account">
                      Explore access <ArrowUpRight size={16} />
                    </Link>
                  </Empty>
                ) : (
                  <>
                    {!connected && (
                      <div className="connection-banner">
                        Connection interrupted. Your draft is safe.
                        <button onClick={refresh}>
                          <RefreshCw size={13} />
                          Retry
                        </button>
                      </div>
                    )}
                    <div className="message-list" ref={list} aria-live="polite">
                      {nextCursor && (
                        <button
                          className="button history-button"
                          disabled={busy}
                          onClick={earlier}
                        >
                          Load earlier messages
                        </button>
                      )}
                      {!ready ? (
                        <Loading />
                      ) : !messages.length ? (
                        <Empty title="Start a good conversation.">
                          A question, an idea, something you shipped. This is
                          the place.
                        </Empty>
                      ) : (
                        messages.map((m: any) => (
                          <article className="message" key={m.id}>
                            <span className="avatar">
                              {m.author_name?.[0] || 'M'}
                            </span>
                            <div className="message-content">
                              <div className="message-meta">
                                <strong>{m.author_name}</strong>
                                <time dateTime={m.created_at}>
                                  {timeAgo(m.created_at)}
                                </time>
                                {m.demo && (
                                  <span className="tiny-label">EXAMPLE</span>
                                )}
                              </div>
                              {m.parent_id && (
                                <div className="reply-context">
                                  <Reply size={12} />
                                  {messages
                                    .find((x) => x.id === m.parent_id)
                                    ?.body?.slice(0, 100) ||
                                    'Reply to an earlier message'}
                                </div>
                              )}
                              <p>{displayBody(m.body)}</p>
                              <div className="message-actions">
                                {m.reactions?.map((r: any) => (
                                  <button
                                    key={r.emoji}
                                    className={r.reacted ? 'reacted' : ''}
                                    onClick={() => react(m, r.emoji)}
                                    aria-label={`React ${r.emoji}`}
                                  >
                                    {r.emoji} {r.count}
                                  </button>
                                ))}
                                <button
                                  onClick={() => react(m)}
                                  aria-label={`Like message from ${m.author_name}`}
                                >
                                  <SmilePlus size={14} />
                                </button>
                                <button onClick={() => setReply(m)}>
                                  <Reply size={14} />
                                  Reply
                                </button>
                                <button
                                  onClick={() => setReport(m.id)}
                                  aria-label={`Report message from ${m.author_name}`}
                                >
                                  <Flag size={13} />
                                </button>
                              </div>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                    <div className="message-compose">
                      {reply && (
                        <div className="replying-to">
                          Replying to {reply.author_name}
                          <button
                            aria-label="Cancel reply"
                            onClick={() => setReply(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      <ErrorMessage error={sendError} />
                      <form onSubmit={submit}>
                        <textarea
                          ref={composer}
                          aria-label={`Message ${room.name}`}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                              e.preventDefault();
                              void submit(e);
                            }
                          }}
                          placeholder={`Share something with ${room.name}…`}
                          maxLength={5000}
                          rows={2}
                          required
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Mention a member"
                          aria-expanded={participants !== null}
                          onClick={mention}
                        >
                          <AtSign size={18} />
                        </button>
                        <button
                          className="button primary"
                          disabled={busy || !body.trim()}
                          type="submit"
                          aria-label="Send message"
                        >
                          <Send size={18} />
                        </button>
                      </form>
                      {participants && (
                        <div
                          className="mention-picker"
                          aria-label="Choose a member to mention"
                        >
                          {participants.length ? (
                            participants.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setBody(
                                    (b) => `${b}${b ? ' ' : ''}@${p.name} `,
                                  );
                                  setMentioned((m) => [
                                    ...m.filter((x) => x.name !== p.name),
                                    p,
                                  ]);
                                  setParticipants(null);
                                  composer.current?.focus();
                                }}
                              >
                                <span className="avatar">{p.name[0]}</span>
                                {p.name}
                              </button>
                            ))
                          ) : (
                            <span>
                              No other members available in this room.
                            </span>
                          )}
                        </div>
                      )}
                      <span className="tiny-label">
                        A GOOD CONVERSATION STARTS WITH YOU.{' '}
                        <span>CTRL + ENTER TO SEND</span>
                      </span>
                    </div>
                  </>
                )}
              </>
            ) : (
              <Empty title="No rooms available yet.">
                Your available rooms will appear here.
              </Empty>
            )}
          </section>
        </div>
      )}
      {report && (
        <Modal titleId="report-title" onClose={() => setReport(null)}>
          <h2 id="report-title">Report this message</h2>
          <form onSubmit={reportMessage}>
            <label className="field">
              What should our moderators know?
              <textarea
                name="reason"
                minLength={5}
                maxLength={1000}
                required
                autoFocus
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setReport(null)}
              >
                Cancel
              </button>
              <button className="button primary">Send report</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
