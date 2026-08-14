import { useEffect, useState } from 'react';
import { Button, Textarea } from '@fluentui/react-components';
import { api } from '../api';

export function CaseConversation({ caseId, session }) {
  const [messages, setMessages] = useState([]); const [body, setBody] = useState(''); const [error, setError] = useState(''); const [sending, setSending] = useState(false);
  const load = () => api(`/reports/${encodeURIComponent(caseId)}/messages`, session).then(setMessages).catch(error => setError(error.message));
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [caseId, session]);
  async function send() { try { setSending(true); setError(''); await api(`/reports/${encodeURIComponent(caseId)}/messages`, session, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); load(); } catch (requestError) { setError(requestError.message); } finally { setSending(false); } }
  return <section className="case-conversation"><strong>Live case conversation</strong><small>Refreshes every 5 seconds. Replies use the SafeRide WhatsApp number.</small><div className="message-list">{messages.map(item => <p key={item.id} className={`message message-${item.direction}`}><b>{item.sender_role}</b><span>{item.body}</span><small>{new Date(item.created_at).toLocaleTimeString()}</small></p>)}</div><Textarea value={body} onChange={(_, data) => setBody(data.value)} placeholder="Reply to the reporter"/><Button appearance="primary" disabled={!body.trim() || sending} onClick={send}>{sending ? 'Sending...' : 'Send reply'}</Button>{error && <p className="form-error">{error}</p>}</section>;
}
