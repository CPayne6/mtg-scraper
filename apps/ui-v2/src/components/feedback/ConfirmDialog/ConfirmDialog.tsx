import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import type { ConfirmFn, ConfirmOptions } from './ConfirmDialog.types';

const ConfirmContext = createContext<ConfirmFn | null>(null);

type PendingConfirm = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Latest resolver — needed so onClose fires the right promise even if a new
  // confirm() call races in.
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    current.resolve(value);
    setPending(null);
  }, []);

  const tone = pending?.options.tone ?? 'default';
  const confirmColor = tone === 'danger' ? 'error' : 'primary';
  const confirmLabel = pending?.options.confirmLabel ?? 'Confirm';
  const cancelLabel = pending?.options.cancelLabel ?? 'Cancel';

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={pending !== null}
        onClose={() => finish(false)}
        maxWidth="xs"
        fullWidth
      >
        {pending && (
          <>
            <DialogTitle sx={{ fontSize: '1.125rem', fontWeight: 600, pb: 1 }}>
              {pending.options.title}
            </DialogTitle>
            {pending.options.description && (
              <DialogContent sx={{ pb: 1.5 }}>
                <DialogContentText component="div" sx={{ color: 'text.secondary' }}>
                  {pending.options.description}
                </DialogContentText>
              </DialogContent>
            )}
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => finish(false)}
              >
                {cancelLabel}
              </Button>
              <Button
                variant="contained"
                color={confirmColor}
                onClick={() => finish(true)}
                autoFocus
              >
                {confirmLabel}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
