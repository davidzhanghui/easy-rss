import { useT } from '../hooks/useT';
import { useUIStore } from '../stores/appStore';
import { Modal } from './Modal';

const ROWS: Array<[string, string]> = [
  ['j / k', 'next / previous article'],
  ['o', 'open article'],
  ['s', 'star / unstar'],
  ['m / u', 'mark read / unread'],
  ['r', 'refresh'],
  ['/', 'search'],
  ['⌘K / Ctrl K', 'command palette'],
  ['?', 'this help'],
];

export function ShortcutsModal() {
  const t = useT();
  const open = useUIStore((s) => s.shortcutsOpen);
  const setUI = useUIStore((s) => s.set);
  return (
    <Modal open={open} onClose={() => setUI({ shortcutsOpen: false })} title={t('shortcuts')}>
      <div className="flex flex-col gap-1">
        {ROWS.map(([k, desc]) => (
          <div key={k} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-muted">{desc}</span>
            <kbd className="kbd !px-2 !py-1 !text-xs !text-strong">
              {k}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
