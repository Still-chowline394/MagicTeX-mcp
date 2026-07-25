// Right panel: the comments workspace and the review gate.
//   suggested — a reviewer agent proposed it; the human Accepts (→ pending) or
//               Rejects it, unless "auto-accept" (copilot) is on.
//   pending   — actionable; the author loop picks these up via check_comments.
//   resolved  — done, with the author's note.
// Clicking a card jumps to its highlight in the PDF.
import { useEffect, useState } from 'react';
import { patchComment, removeComment, type Comment } from '../api';

export function CommentsPanel({
  comments, selectedId, onJump,
}: {
  comments: Comment[];
  selectedId: string | null;
  onJump: (c: Comment) => void;
}) {
  const [auto, setAuto] = useState(() => localStorage.getItem('ws-auto-accept') === '1');
  useEffect(() => { localStorage.setItem('ws-auto-accept', auto ? '1' : '0'); }, [auto]);

  const suggested = comments.filter((c) => c.status === 'suggested');
  const pending = comments.filter((c) => c.status === 'pending');
  const resolved = comments.filter((c) => c.status === 'resolved');

  // Copilot mode: as reviewer suggestions arrive, accept them automatically.
  useEffect(() => {
    if (!auto) return;
    for (const c of suggested) void patchComment(c.id, { status: 'pending' });
  }, [auto, suggested]);

  const accept = (c: Comment) => void patchComment(c.id, { status: 'pending' });
  const reject = (c: Comment) => void removeComment(c.id);

  const card = (c: Comment) => (
    <div key={c.id} className={`comment ${c.id === selectedId ? 'sel' : ''} ${c.status}`} onClick={() => onJump(c)}>
      <div className="comment-quote">
        {c.role === 'reviewer' && <span className="role-badge">reviewer</span>}
        p.{c.page} · “{c.quote.slice(0, 90)}{c.quote.length > 90 ? '…' : ''}”
      </div>
      <div className="comment-text">{c.text}</div>
      {c.status === 'resolved' && c.resolvedNote && <div className="comment-note">✓ {c.resolvedNote}</div>}
      <div className="comment-actions" onClick={(e) => e.stopPropagation()}>
        {c.status === 'suggested' && <>
          <button className="on" onClick={() => accept(c)}>Accept</button>
          <button className="ghost" onClick={() => reject(c)}>Reject</button>
        </>}
        {c.status === 'pending' && <>
          <button className="ghost" onClick={() => void patchComment(c.id, { status: 'resolved' })}>resolve</button>
          <button className="ghost" onClick={() => void removeComment(c.id)}>delete</button>
        </>}
        {c.status === 'resolved' &&
          <button className="ghost" onClick={() => void patchComment(c.id, { status: 'pending' })}>reopen</button>}
      </div>
    </div>
  );

  return (
    <div className="comments">
      <label className="auto-accept" title="Copilot: automatically accept reviewer suggestions so the loop resolves them without a manual gate">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        Auto-accept reviewer suggestions (copilot)
      </label>

      {comments.length === 0 && (
        <div className="panel-hint">
          Select text on the PDF and add a comment — or have a reviewer agent post them.
          Accepted comments become instructions the author loop picks up (“address my comments”).
        </div>
      )}

      {suggested.length > 0 && (
        <div className="comments-head suggested-head">
          Suggested · {suggested.length}
          <button className="ghost tiny" onClick={() => suggested.forEach(accept)}>accept all</button>
          <button className="ghost tiny" onClick={() => suggested.forEach(reject)}>reject all</button>
        </div>
      )}
      {suggested.map(card)}

      {pending.length > 0 && <div className="comments-head">Pending · {pending.length}</div>}
      {pending.map(card)}

      {resolved.length > 0 && <div className="comments-head">Resolved · {resolved.length}</div>}
      {resolved.map(card)}
    </div>
  );
}
