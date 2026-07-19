import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useLists } from './ListsContext';

export function ListRenameDialog({ list, open, onClose, onRenamed }: { list: { id: string; name: string } | null; open: boolean; onClose: () => void; onRenamed?: (name: string) => void }) {
  const { lists, rename } = useLists();
  const [draft, setDraft] = useState(list?.name ?? '');
  const activeName = list?.name ?? '';
  const value = open && draft === '' ? activeName : draft;
  const trimmed = useMemo(() => value.trim(), [value]);
  const canSave = !!list && trimmed.length > 0 && trimmed.length <= 100 && trimmed !== activeName && !lists.some((entry) => entry.id !== list.id && entry.name === trimmed);
  const save = async () => { if (!list || !canSave) return; const renamed = await rename(list.id, trimmed); if (renamed) { onRenamed?.(renamed); onClose(); } };
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>Rename Decklist</DialogTitle><DialogContent><TextField autoFocus margin="dense" label="Decklist name" fullWidth value={value} inputProps={{ maxLength: 100 }} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && canSave) void save(); }} /></DialogContent><DialogActions><Button variant="outlined" onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!canSave} onClick={() => void save()}>Save</Button></DialogActions></Dialog>;
}
