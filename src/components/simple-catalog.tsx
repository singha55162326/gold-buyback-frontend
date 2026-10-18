'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pagination, usePagination } from './pagination';
import { useToast } from './toast';
import { api, ApiError } from '@/lib/api';

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
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
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

  const pager = usePagination(rows);

  const canSave = fields
    .filter((f) => !f.optional)
    .every((f) => (form[f.key] ?? '').trim().length > 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{titleLo}</h1>
          <span className="badge bg-slate-100 text-slate-600">TOR {section}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{descriptionLo}</p>
      </div>

      <div className="card p-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="label" htmlFor={field.key}>
                {field.labelLo}
                {field.optional && <span className="ml-1 text-xs text-slate-400">(ບໍ່ບັງຄັບ)</span>}
              </label>
              {field.options ? (
                <select
                  id={field.key}
                  className="input"
                  value={form[field.key] ?? ''}
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
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການທັງໝົດ</h2>
          <span className="text-xs text-slate-500">{rows.length} ລາຍການ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.labelLo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={columns.length} className="py-6 text-center text-slate-400">
                    ກຳລັງໂຫຼດ...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-8 text-center text-slate-400">
                    ຍັງບໍ່ມີລາຍການ
                  </td>
                </tr>
              )}
              {pager.pageItems.map((row, index) => (
                <tr key={String(row.id ?? index)}>
                  {columns.map((col) => (
                    <td key={col.key} className={col.key === 'code' ? 'font-mono text-xs' : ''}>
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}
