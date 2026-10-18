import Link from 'next/link';
import { PageHead } from './page-head';

export interface ShellField {
  labelLo: string;
  hint?: string;
}

export interface ShellSection {
  titleLo: string;
  /** Column headers of the table this module renders. */
  columns?: string[];
  /** Form inputs this module collects. */
  fields?: ShellField[];
  /** Buttons/actions the TOR specifies for this module. */
  actions?: string[];
  note?: string;
}

export interface ModuleShellProps {
  titleLo: string;
  section: string;
  descriptionLo: string;
  sections: ShellSection[];
  /** Open questions or rules that must be confirmed before this is built. */
  openQuestions?: string[];
}

/**
 * A laid-out placeholder for a module whose write path lands in a later phase.
 *
 * It is not an empty "coming soon" page: it renders the actual table columns,
 * form fields and actions the TOR specifies, so the shop can walk the whole
 * system, confirm the structure is right, and flag missing fields before any
 * of the logic is written.
 */
export function ModuleShell({
  titleLo,
  section,
  descriptionLo,
  sections,
  openQuestions,
}: ModuleShellProps) {
  return (
    <div className="space-y-6">
      <PageHead
        title={titleLo}
        subtitle={descriptionLo}
        actions={
          <>
            <span className="badge recessed text-muted">TOR {section}</span>
            <span className="badge status-warning">ໜ້າຈໍຕົວຢ່າງ</span>
          </>
        }
      />

      <div className="notice status-warning">
        ໂຄງສ້າງໜ້າຈໍນີ້ຖືກອອກແບບຕາມ TOR ແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ເຊື່ອມກັບຖານຂໍ້ມູນ (Phase 2).
        ກະລຸນາກວດສອບວ່າ ຫົວຂໍ້ຕາຕະລາງ ແລະ ຊ່ອງປ້ອນຂໍ້ມູນ ຄົບຖ້ວນ ຫຼື ບໍ່.
      </div>

      {sections.map((s) => (
        <div key={s.titleLo} className="card">
          <div className="card-header">
            <h2 className="card-title">{s.titleLo}</h2>
            {s.actions && s.actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {s.actions.map((action) => (
                  <span
                    key={action}
                    className="btn-secondary cursor-not-allowed opacity-60"
                  >
                    {action}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="p-5">
            {s.fields && s.fields.length > 0 && (
              <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {s.fields.map((field) => (
                  <div key={field.labelLo}>
                    <span className="label">{field.labelLo}</span>
                    <div className="input cursor-not-allowed bg-recessed text-muted">
                      {field.hint ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {s.columns && s.columns.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {s.columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={s.columns.length} className="py-8 text-center text-muted">
                        ຍັງບໍ່ມີຂໍ້ມູນ
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {s.note && <p className="mt-4 text-sm text-muted">{s.note}</p>}
          </div>
        </div>
      ))}

      {openQuestions && openQuestions.length > 0 && (
        <div className="card border-line">
          <div className="card-header">
            <h2 className="card-title text-danger">ຄຳຖາມທີ່ຕ້ອງຢືນຢັນກ່ອນພັດທະນາ</h2>
          </div>
          <ul className="list-inside list-disc space-y-2 p-5 text-sm text-muted">
            {openQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-sm">
        <Link href="/dashboard" className="btn-ghost">
          ← ກັບໄປ Dashboard
        </Link>
      </div>
    </div>
  );
}
