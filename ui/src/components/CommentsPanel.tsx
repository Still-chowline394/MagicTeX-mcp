// Right panel: the comments workspace. Pending comments are instructions
// waiting for Claude (via the check_comments MCP tool); resolved ones keep
// Claude's note. Clicking a card jumps to its highlight in the PDF.
import { patchComment, removeComment, type Comment } from '../api';

export function CommentsPanel({
  comments, selectedId, onJump,
}: {
  comments: Comment[];
  selectedId: string | null;
  onJump: (c: Comment) => void;
}) {
  const pending = comments.filter((c) => c.status === 'pending');
  const resolved = comments.filter((c) => c.status === 'resolved');

  const card = (c: Comment) => (
    <div key={c.id} className={`comment ${c.id === selectedId ? 'sel' : ''} ${c.status}`} onClick={() => onJump(c)}>
      <div className="comment-quote">p.{c.page} · “{c.quote.slice(0, 90)}{c.quote.length > 90 ? '…' : ''}”</div>
      <div className="comment-text">{c.text}</div>
      {c.status === 'resolved' && c.resolvedNote && <div className="comment-note">✓ {c.resolvedNote}</div>}
      <div className="comment-actions" onClick={(e) => e.stopPropagation()}>
        {c.status === 'pending'
          ? <button className="ghost" onClick={() => void patchComment(c.id, { status: 'resolved' })}>resolve</button>
          : <button className="ghost" onClick={() => void patchComment(c.id, { status: 'pending' })}>reopen</button>}
        <button className="ghost" onClick={() => void removeComment(c.id)}>delete</button>
      </div>
    </div>
  );

  return (
    <div className="comments">
      {comments.length === 0 && (
        <div className="panel-hint">
          Select text on the PDF and add a comment — it becomes an instruction Claude can
          pick up (ask it to “address my comments”).
        </div>
      )}
      {pending.length > 0 && <div className="comments-head">Pending · {pending.length}</div>}
      {pending.map(card)}
      {resolved.length > 0 && <div className="comments-head">Resolved · {resolved.length}</div>}
      {resolved.map(card)}
    </div>
  );
}
