'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pagination, usePagination } from './pagination';
import { PageHead } from './page-head';
import { useToast } from './toast';
import { api, ApiError } from '@/lib/api';
import { TableStateRow } from '@/components/query-state';

export interface CatalogField {
  key: string;
  labelLo: string;
  placeholder?: string;
  /** Renders a <select> instead of a text input. */
  options?: Array<{ value: string; labelLo: string }>;
  optional?: boolean;
}

export interface CatalogColumn {
  key: string;
  labelLo: string;
  /** Maps a raw value to what the cell should show. */
  render?: (row: Record<string, unknown>) => string;
}

/**
 * The shape shared by every "add a row, list the rows" reference screen:
 * ລາຍການ Bank, ເພີ້ມລາຍການຮັບຈ່າຍ, ລາຍການ AP-AR (Cash), ປະເພດຄຳ, ລາຍການຄຳ.
 *
 * They differ only in their fields and columns, so they share one component
 * rather than five near-copies that would drift apart.
 */
export function SimpleCatalog({
  titleLo,
  descriptionLo,
  section,
  listPath,
  createPath,
  queryKey,
  fields,
  columns,
  addLabelLo,
  editPath,
  editableKeys,
}: {
  titleLo: string;
  descriptionLo: string;
  section: string;
  listPath: string;
  createPath: string;
  queryKey: string[];
  fields: CatalogField[];
  columns: CatalogColumn[];
  addLabelLo: string;
  /**
   * Base path for PATCH/DELETE on a single row, when the module supports
   * them. Defaults to createPath, which is how every current caller is set
   * up; pass it explicitly when the two differ.
   */
  editPath?: string;
  /** Fields that may be edited in place. Defaults to every non-code field. */
  editableKeys?: string[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const { data: rows = [], isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<Array<Record<string, unknown>>>(listPath),
  });

  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      for (const field of fields) {
        const value = form[field.key]?.trim();
        if (value) body[field.key] = value;
      }
      return api.post(createPath, body);
    },
    onSuccess: () => {
      setForm({});
      setError(null);
      toast.success('ບັນທຶກແລ້ວ', addLabelLo);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບັນທຶກບໍ່ສຳເລັດ', detail);
    },
  });

  const rowPath = editPath ?? createPath;
  // The code is issued by the server and may already be printed on a
  // receipt, so it is the one field that never becomes editable.
  const editable = fields.filter(
    (f) => f.key !== 'code' && (!editableKeys || editableKeys.includes(f.key)),
  );

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) =>
      api.patch(`${rowPath}/${id}`, body),
    onSuccess: () => {
      setEditing(null);
      setEditForm({});
      toast.success('ແກ້ໄຂແລ້ວ');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ';
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${rowPath}/${id}`),
    onSuccess: () => {
      setConfirming(null);
      toast.success('ລຶບແລ້ວ');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      // The in-use guard speaks Lao and names what is using the row, so it
      // is worth showing in full rather than a generic failure.
      const detail = e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ';
      setConfirming(null);
      toast.error('ລຶບບໍ່ໄດ້', detail);
    },
  });

  const pager = usePagination(rows);

  const canSave = fields
    .filter((f) => !f.optional)
    .every((f) => (form[f.key] ?? '').trim().length > 0);

  return (
    <div className="space-y-6">
      <PageHead
        title={titleLo}
        subtitle={descriptionLo}
        actions={<span className="badge recessed text-gold">TOR {section}</span>}
      />

      <div data-fade className="card p-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="label" htmlFor={field.key}>
                {field.labelLo}
                {field.optional && <span className="ml-1 text-xs text-muted">(ບໍ່ບັງຄັບ)</span>}
              </label>
              {field.options ? (
                <select
                  id={field.key}
                  className="input"
                  value={form[field.key] ?? ''}
                  aria-describedby={error ? 'catalog-error' : undefined}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                >
                  <option value="">— ເລືອກ —</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.labelLo}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={field.key}
                  className="input"
                  placeholder={field.placeholder}
                  aria-describedby={error ? 'catalog-error' : undefined}
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div id="catalog-error" role="alert" className="notice status-danger mt-3">
            {error}
          </div>
        )}

        <div className="mt-4">
          <button
            className="btn-primary"
            disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : addLabelLo}
          </button>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການທັງໝົດ</h2>
          <span className="num text-xs text-muted">{rows.length} ລາຍການ</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={titleLo}>
          <table className="table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.labelLo}</th>
                ))}
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={columns.length + 1}
                isLoading={isLoading}
                isError={isError}
                error={loadError}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void refetch()}
              />
              {pager.pageItems.map((row, index) => {
                const id = String(row.id ?? '');
                const isEditing = editing === id;
                const busy = update.isPending || remove.isPending;
                return (
                  <tr key={id || index}>
                    {columns.map((col) => {
                      const field = editable.find((f) => f.key === col.key);
                      if (isEditing && field) {
                        return (
                          <td key={col.key}>
                            {field.options ? (
                              <select
                                className="input"
                                value={editForm[col.key] ?? ''}
                                aria-label={field.labelLo}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, [col.key]: e.target.value }))
                                }
                              >
                                {field.options.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.labelLo}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="input"
                                value={editForm[col.key] ?? ''}
                                aria-label={field.labelLo}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, [col.key]: e.target.value }))
                                }
                              />
                            )}
                          </td>
                        );
                      }
                      return (
                        <td key={col.key} className={col.key === 'code' ? 'font-mono text-xs' : ''}>
                          {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                        </td>
                      );
                    })}
                    <td className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => update.mutate({ id, body: editForm })}
                          >
                            ບັນທຶກ
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              setEditing(null);
                              setEditForm({});
                            }}
                          >
                            ຍົກເລີກ
                          </button>
                        </div>
                      ) : confirming === id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            className="btn-danger"
                            disabled={busy}
                            onClick={() => remove.mutate(id)}
                          >
                            ຢືນຢັນລຶບ
                          </button>
                          <button className="btn-secondary" onClick={() => setConfirming(null)}>
                            ຍົກເລີກ
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-3">
                          {editable.length > 0 && (
                            <button
                              className="btn-ghost"
                              onClick={() => {
                                setConfirming(null);
                                setEditing(id);
                                setEditForm(
                                  Object.fromEntries(
                                    editable.map((f) => [f.key, String(row[f.key] ?? '')]),
                                  ),
                                );
                              }}
                            >
                              ແກ້ໄຂ
                            </button>
                          )}
                          <button
                            className="btn-ghost text-danger"
                            onClick={() => {
                              setEditing(null);
                              setConfirming(id);
                            }}
                          >
                            ລຶບ
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}
