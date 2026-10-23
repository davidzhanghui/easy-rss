import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useT } from '../hooks/useT';

export function ConfirmDialog({
  open,
  message,
  onCancel,
  onConfirm,
  danger,
}: {
  open: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  danger?: boolean;
}) {
  const t = useT();
  return (
    <Modal open={open} onClose={onCancel} title={t('delete')}>
      <p className="text-sm leading-6 text-body">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCancel} className="btn btn--ghost">
          {t('cancel')}
        </button>
        <button onClick={onConfirm} className={danger ? 'btn btn--danger-solid' : 'btn btn--primary'}>
          {t('confirm')}
        </button>
      </div>
    </Modal>
  );
}

export function PromptDialog({
  open,
  title,
  initial,
  placeholder,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  initial: string;
  placeholder?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(value.trim());
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="field text-sm"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn btn--ghost">
            {t('cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('confirm')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
