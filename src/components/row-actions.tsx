'use client';

/**
 * ແກ້ໄຂ / ລຶບ for one row of a reference table.
 *
 * Delete is two-step on purpose. These rows are named by ledgers and
 * receipts, and although the API refuses to remove one that is in use, a
 * single click is still the wrong amount of effort for an action that
 * retires something the whole shop picks from.
 */
export function RowActions({
  id,
  editing,
  confirming,
  busy,
  canSave = true,
  onEdit,
  onSave,
  onCancel,
  onAskDelete,
  onDelete,
  editLabelLo = 'ແກ້ໄຂ',
}: {
  id: string;
  /** Id of the row currently being edited, if any. */
  editing: string | null;
  /** Id of the row currently awaiting delete confirmation, if any. */
  confirming: string | null;
  busy: boolean;
  canSave?: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  editLabelLo?: string;
}) {
  if (editing === id) {
    return (
      <div className="flex justify-end gap-2">
        <button className="btn-primary" disabled={busy || !canSave} onClick={onSave}>
          ບັນທຶກ
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          ຍົກເລີກ
        </button>
      </div>
    );
  }

  if (confirming === id) {
    return (
      <div className="flex justify-end gap-2">
        <button className="btn-danger" disabled={busy} onClick={onDelete}>
          ຢືນຢັນລຶບ
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          ຍົກເລີກ
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <button className="btn-ghost" onClick={onEdit}>
        {editLabelLo}
      </button>
      <button className="btn-ghost text-danger" onClick={onAskDelete}>
        ລຶບ
      </button>
    </div>
  );
}
