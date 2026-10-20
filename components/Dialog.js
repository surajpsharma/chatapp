'use client';

/* Small centred dialog with a list of actions. */
export default function Dialog({ open, title, message, actions, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tiny" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="dialog-body">
          <h3 className="dialog-title">{title}</h3>
          {message && <p className="dialog-text">{message}</p>}
          <div className="dialog-actions">
            {(actions || []).map((a) => (
              <button
                key={a.label}
                className={'btn-block' + (a.danger ? ' danger' : '')}
                onClick={() => {
                  onClose();
                  a.run();
                }}
              >
                {a.label}
              </button>
            ))}
            <button className="btn-block plain" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
