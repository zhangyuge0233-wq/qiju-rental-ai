import { useEffect, useRef } from 'react';

interface DeleteDialogProps {
  open: boolean;
  deleting?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </svg>
  );
}

export function DeleteDialog({
  open,
  deleting = false,
  error,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [deleting, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="delete-layer">
      <div className="delete-scrim" aria-hidden="true" />
      <section
        className="delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <div className="delete-dialog__icon"><TrashIcon /></div>
        <h2 id="delete-dialog-title">删除这条设计记录？</h2>
        <p id="delete-dialog-description">删除后将无法恢复，原图和效果图都会从本机移除。</p>
        {error && <p className="delete-dialog__error" role="alert">{error}</p>}
        <div className="delete-dialog__actions">
          <button
            ref={cancelButtonRef}
            className="delete-dialog__cancel"
            type="button"
            disabled={deleting}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="delete-dialog__confirm"
            type="button"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? '正在删除' : '确认删除'}
          </button>
        </div>
      </section>
    </div>
  );
}
