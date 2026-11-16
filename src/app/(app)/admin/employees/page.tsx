'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { TableStateRow } from '@/components/query-state';
import { RowActions } from '@/components/row-actions';
import { Dialog } from '@/components/dialog';
import { isPhoneOrBlank } from '@/lib/validate';

interface Branch {
  id: string;
  code: string;
  nameLo: string;
  isActive: boolean;
  _count?: { employees: number };
  createdBy?: string;
}

interface Employee {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  position: string | null;
  branchId: string | null;
  branch: { id: string; code: string; nameLo: string; isActive: boolean } | null;
  isActive: boolean;
  /** ຜູ້ບັນທຶກ — ອ່ານຈາກ Audit Log ຢູ່ server. */
  createdBy: string;
}

/** TOR §3.7 — Module ຈັດການຂໍ້ມູນພະນັກງານ (Employee) ແລະ ສັງກັດ / ສາຂາ. */
export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Create employee form state
  const [fullName, setFullName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Inline edit / delete employee state
  const [editing, setEditing] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editBranchId, setEditBranchId] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  // Branch management dialog state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchError, setBranchError] = useState<string | null>(null);
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [confirmingBranch, setConfirmingBranch] = useState<string | null>(null);

  const {
    data: rows = [],
    isLoading,
    isError: rowsFailed,
    error: rowsError,
    refetch: refetchRows,
  } = useQuery({
    queryKey: ['catalog', 'employees', 'admin'],
    queryFn: () => api.get<Employee[]>('/catalog/employees?withActor=true&includeInactive=true'),
  });

  const {
    data: branches = [],
    isLoading: branchesLoading,
    isError: branchesFailed,
    error: branchesError,
    refetch: refetchBranches,
  } = useQuery({
    queryKey: ['catalog', 'branches', 'admin'],
    queryFn: () => api.get<Branch[]>('/catalog/branches?withActor=true&includeInactive=true'),
  });

  const activeBranches = useMemo(() => branches.filter((b) => b.isActive), [branches]);

  const filteredRows = useMemo(() => {
    const byBranch =
      branchFilter === '__NONE__'
        ? rows.filter((r) => !r.branchId)
        : branchFilter
          ? rows.filter((r) => r.branchId === branchFilter)
          : rows;

    const q = searchTerm.trim().toLowerCase();
    if (!q) return byBranch;
    return byBranch.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        (r.position ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q) ||
        (r.branch?.nameLo ?? '').toLowerCase().includes(q),
    );
  }, [rows, branchFilter, searchTerm]);

  const pager = usePagination(filteredRows);

  const invalidateEmployees = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'employees'] });
  };

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'employees'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'branches'] });
  };

  const canCreate = Boolean(fullName.trim()) && isPhoneOrBlank(phone);

  const create = useMutation({
    mutationFn: () =>
      api.post('/catalog/employees', {
        fullName: fullName.trim(),
        branchId: branchId || undefined,
        position: position.trim() || undefined,
        phone: phone.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ', 'ເພີ່ມຂໍ້ມູນພະນັກງານແລ້ວ');
      setFullName('');
      setBranchId('');
      setPosition('');
      setPhone('');
      setError(null);
      invalidateAll();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      patch: {
        fullName?: string;
        branchId?: string | null;
        position?: string;
        phone?: string;
        isActive?: boolean;
      };
    }) => api.patch(`/catalog/employees/${input.id}`, input.patch),
    onSuccess: () => {
      setEditing(null);
      toast.success('ແກ້ໄຂແລ້ວ');
      invalidateAll();
    },
    onError: (e) => {
      toast.error('ບໍ່ສຳເລັດ', e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/employees/${id}`),
    onSuccess: () => {
      setConfirming(null);
      toast.success('ລຶບແລ້ວ');
      invalidateAll();
    },
    onError: (e) => {
      setConfirming(null);
      toast.error('ລຶບຂໍ້ມູນພະນັກງານບໍ່ໄດ້', e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ');
    },
  });

  // Branch mutations
  const createBranch = useMutation({
    mutationFn: () => api.post('/catalog/branches', { nameLo: newBranchName.trim() }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ', 'ເພີ່ມສັງກັດ / ສາຂາແລ້ວ');
      setNewBranchName('');
      setBranchError(null);
      invalidateAll();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setBranchError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const updateBranch = useMutation({
    mutationFn: (input: { id: string; patch: { nameLo?: string; isActive?: boolean } }) =>
      api.patch(`/catalog/branches/${input.id}`, input.patch),
    onSuccess: () => {
      setEditingBranch(null);
      setBranchError(null);
      toast.success('ແກ້ໄຂສາຂາແລ້ວ');
      invalidateAll();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ';
      setBranchError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const removeBranch = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/branches/${id}`),
    onSuccess: () => {
      setConfirmingBranch(null);
      setBranchError(null);
      toast.success('ລຶບສາຂາແລ້ວ');
      invalidateAll();
    },
    onError: (e) => {
      setConfirmingBranch(null);
      const detail = e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ';
      setBranchError(detail);
      toast.error('ລຶບສາຂາບໍ່ໄດ້', detail);
    },
  });

  const activeCount = useMemo(() => rows.filter((r) => r.isActive).length, [rows]);

  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການຂໍ້ມູນພະນັກງານ"
        subtitle="ລາຍຊື່ພະນັກງານຮັບ Order ແລະ ຮັບຝາກສິນຄ້າ — ສະແດງໃນ dropdown ເລືອກພະນັກງານຮັບ (TOR §3.7)"
        actions={
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={() => {
              setBranchError(null);
              setBranchModalOpen(true);
            }}
          >
            <span>ຈັດການ ສັງກັດ / ສາຂາ</span>
            <span className="badge recessed text-xs num">{activeBranches.length}</span>
          </button>
        }
      />

      <div data-fade className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="emp-fullName">
              ຊື່ ແລະ ນາມສະກຸນ <span className="text-danger">*</span>
            </label>
            <input
              id="emp-fullName"
              className="input"
              aria-describedby={error ? 'employee-error' : undefined}
              placeholder="ນາງ ສຸດາ ພົມມະວົງ"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="label" htmlFor="emp-branch">ສັງກັດ / ສາຂາ</label>
              <button
                type="button"
                className="text-[11px] font-medium text-[var(--gold)] hover:underline mb-1"
                onClick={() => {
                  setBranchError(null);
                  setBranchModalOpen(true);
                }}
              >
                + ເພີ່ມສາຂາ
              </button>
            </div>
            <select
              id="emp-branch"
              className="input"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">— ບໍ່ລະບຸສາຂາ —</option>
              {activeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameLo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="emp-position">ຕຳແໜ່ງ / ພະແນກ</label>
            <input
              id="emp-position"
              className="input"
              placeholder="ພະນັກງານໜ້າຮ້ານ"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="emp-phone">ເບີໂທ (8 ຕົວເລກ)</label>
            <input
              id="emp-phone"
              className="input num font-mono"
              inputMode="numeric"
              maxLength={8}
              placeholder="20xxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
            {phone.length > 0 && !isPhoneOrBlank(phone) && (
              <p className="mt-1 text-[11px] text-warning">ເບີໂທຕ້ອງມີ 8 ຕົວເລກ ({phone.length}/8)</p>
            )}
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!canCreate || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : '+ ເພີ່ມພະນັກງານ'}
            </button>
          </div>
        </div>

        {error && (
          <div id="employee-error" role="alert" className="notice status-danger mt-3">
            {error}
          </div>
        )}
      </div>

      <div data-fade className="card">
        <div className="card-header flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="card-title">ລາຍຊື່ພະນັກງານ</h2>
            <span className="badge recessed text-xs num">
              ໃຊ້ງານ {activeCount} / {rows.length} ຄົນ
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              aria-label="ກອງຕາມສັງກັດ/ສາຂາ"
              className="filter-date w-full sm:w-48"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="">ທຸກສັງກັດ / ສາຂາ</option>
              <option value="__NONE__">— ບໍ່ລະບຸສາຂາ —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameLo}{!b.isActive ? ' (ປິດໃຊ້)' : ''}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="filter-date w-full sm:w-64"
              placeholder="ຄົ້ນຫາ ລະຫັດ / ຊື່ / ຕຳແໜ່ງ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍຊື່ພະນັກງານ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ</th>
                <th>ຊື່ ແລະ ນາມສະກຸນ</th>
                <th>ສັງກັດ / ສາຂາ</th>
                <th>ຕຳແໜ່ງ</th>
                <th>ເບີໂທ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={8}
                isLoading={isLoading}
                isError={rowsFailed}
                error={rowsError}
                isEmpty={pager.pageItems.length === 0}
                emptyText={searchTerm || branchFilter ? 'ບໍ່ພົບພະນັກງານທີ່ຄົ້ນຫາ' : 'ຍັງບໍ່ມີຂໍ້ມູນພະນັກງານ'}
                onRetry={() => void refetchRows()}
              />
              {pager.pageItems.map((row) => {
                const isThisEditing = editing === row.id;
                const canSaveEdit = Boolean(editFullName.trim()) && isPhoneOrBlank(editPhone);

                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs text-muted">{row.code}</td>
                    <td className="font-medium">
                      {isThisEditing ? (
                        <input
                          className="input h-8 min-w-[180px]"
                          value={editFullName}
                          aria-label={`ຊື່ພະນັກງານ — ${row.code}`}
                          onChange={(e) => setEditFullName(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        row.fullName
                      )}
                    </td>
                    <td>
                      {isThisEditing ? (
                        <select
                          className="input h-8 min-w-[150px] text-xs py-0"
                          aria-label={`ສັງກັດ / ສາຂາ — ${row.code}`}
                          value={editBranchId}
                          onChange={(e) => setEditBranchId(e.target.value)}
                        >
                          <option value="">— ບໍ່ລະບຸສາຂາ —</option>
                          {row.branch && !activeBranches.some((b) => b.id === row.branchId) && (
                            <option value={row.branch.id}>{row.branch.nameLo} (ປິດໃຊ້)</option>
                          )}
                          {activeBranches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.nameLo}
                            </option>
                          ))}
                        </select>
                      ) : row.branch ? (
                        <span className="badge recessed text-xs">{row.branch.nameLo}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {isThisEditing ? (
                        <input
                          className="input h-8 min-w-[140px]"
                          value={editPosition}
                          placeholder="ຕຳແໜ່ງ"
                          aria-label={`ຕຳແໜ່ງ — ${row.code}`}
                          onChange={(e) => setEditPosition(e.target.value)}
                        />
                      ) : (
                        <span className={row.position ? 'text-fg' : 'text-muted'}>
                          {row.position ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {isThisEditing ? (
                        <input
                          className="input num font-mono h-8 w-32"
                          inputMode="numeric"
                          maxLength={8}
                          value={editPhone}
                          placeholder="20xxxxxx"
                          aria-label={`ເບີໂທ — ${row.code}`}
                          onChange={(e) =>
                            setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 8))
                          }
                        />
                      ) : (
                        <span className={row.phone ? 'font-mono' : 'text-muted'}>
                          {row.phone ?? '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          row.isActive ? 'status-success' : 'badge recessed text-muted'
                        }
                      >
                        {row.isActive ? 'ໃຊ້ງານຢູ່' : 'ປິດການນຳໃຊ້'}
                      </span>
                    </td>
                    <td className="text-muted text-xs">{row.createdBy}</td>
                    <td className="text-right">
                      <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                        {!isThisEditing && confirming !== row.id && (
                          <button
                            type="button"
                            className={
                              row.isActive
                                ? 'btn-ghost text-xs text-muted hover:text-danger'
                                : 'btn-ghost text-xs text-success'
                            }
                            disabled={update.isPending}
                            onClick={() =>
                              update.mutate({
                                id: row.id,
                                patch: { isActive: !row.isActive },
                              })
                            }
                          >
                            {row.isActive ? 'ປິດໃຊ້' : 'ເປີດໃຊ້'}
                          </button>
                        )}
                        <RowActions
                          id={row.id}
                          editing={editing}
                          confirming={confirming}
                          busy={update.isPending || remove.isPending}
                          canSave={canSaveEdit}
                          onEdit={() => {
                            setConfirming(null);
                            setEditing(row.id);
                            setEditFullName(row.fullName);
                            setEditBranchId(row.branchId ?? '');
                            setEditPosition(row.position ?? '');
                            setEditPhone(row.phone ?? '');
                          }}
                          onSave={() =>
                            update.mutate({
                              id: row.id,
                              patch: {
                                fullName: editFullName.trim(),
                                branchId: editBranchId || null,
                                position: editPosition.trim(),
                                phone: editPhone.trim(),
                              },
                            })
                          }
                          onCancel={() => {
                            setEditing(null);
                            setConfirming(null);
                          }}
                          onAskDelete={() => {
                            setEditing(null);
                            setConfirming(row.id);
                          }}
                          onDelete={() => remove.mutate(row.id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          ພະນັກງານທີ່ເປີດໃຊ້ງານຢູ່ຈະປາກົດໃນ dropdown ເລືອກ ພະນັກງານຮັບ ຂອງໜ້າ Order ແລະ ຝາກສິນຄ້າ.
          ຖ້າປິດໃຊ້ງານ ຈະເຊື່ອງຈາກ dropdown ແຕ່ຍັງຮັກສາປະຫວັດບິນເກົ່າໄວ້ຄົບຖ້ວນ.
        </p>
      </div>

      {/* Modal: ຈັດການ ສັງກັດ / ສາຂາ */}
      <Dialog
        open={branchModalOpen}
        onClose={() => {
          setBranchModalOpen(false);
          setEditingBranch(null);
          setConfirmingBranch(null);
          setBranchError(null);
        }}
        title="ຈັດການ ສັງກັດ / ສາຂາ"
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-muted">
              ໃຊ້ສຳລັບລະບຸສັງກັດ/ສາຂາຂອງພະນັກງານ (Optional)
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setBranchModalOpen(false);
                setEditingBranch(null);
                setConfirmingBranch(null);
                setBranchError(null);
              }}
            >
              ປິດ
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Add Branch Form */}
          <div className="rounded-lg border border-line bg-surface/40 p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="label" htmlFor="branch-new-name">
                  ຊື່ສັງກັດ / ສາຂາ <span className="text-danger">*</span>
                </label>
                <input
                  id="branch-new-name"
                  className="input"
                  placeholder="ເຊັ່ນ: ສຳນັກງານໃຫຍ່, ສາຂາຕະຫຼາດເຊົ້າ..."
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn-primary w-full sm:w-auto"
                  disabled={!newBranchName.trim() || createBranch.isPending}
                  onClick={() => createBranch.mutate()}
                >
                  {createBranch.isPending ? 'ກຳລັງບັນທຶກ...' : '+ ເພີ່ມສາຂາ'}
                </button>
              </div>
            </div>
            {branchError && (
              <div role="alert" className="notice status-danger mt-3 text-xs">
                {branchError}
              </div>
            )}
          </div>

          {/* Branches Table */}
          <div className="table-wrap rounded-lg border border-line" tabIndex={0} role="region" aria-label="ລາຍການສາຂາ">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດ</th>
                  <th>ຊື່ສັງກັດ / ສາຂາ</th>
                  <th className="text-right">ພະນັກງານ</th>
                  <th>ສະຖານະ</th>
                  <th>ຜູ້ບັນທຶກ</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                <TableStateRow
                  colSpan={6}
                  isLoading={branchesLoading}
                  isError={branchesFailed}
                  error={branchesError}
                  isEmpty={branches.length === 0}
                  emptyText="ຍັງບໍ່ມີຂໍ້ມູນສັງກັດ / ສາຂາ"
                  onRetry={() => void refetchBranches()}
                  dense
                />
                {branches.map((b) => {
                  const isEditingThis = editingBranch === b.id;
                  return (
                    <tr key={b.id}>
                      <td className="font-mono text-xs text-muted">{b.code}</td>
                      <td className="font-medium">
                        {isEditingThis ? (
                          <input
                            className="input h-8 min-w-[160px]"
                            value={editBranchName}
                            aria-label={`ຊື່ສາຂາ — ${b.code}`}
                            onChange={(e) => setEditBranchName(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          b.nameLo
                        )}
                      </td>
                      <td className="num text-right">{b._count?.employees ?? 0}</td>
                      <td>
                        <span
                          className={
                            b.isActive ? 'status-success' : 'badge recessed text-muted'
                          }
                        >
                          {b.isActive ? 'ໃຊ້ງານຢູ່' : 'ປິດການນຳໃຊ້'}
                        </span>
                      </td>
                      <td className="text-muted text-xs">{b.createdBy ?? '—'}</td>
                      <td className="text-right">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                          {!isEditingThis && confirmingBranch !== b.id && (
                            <button
                              type="button"
                              className={
                                b.isActive
                                  ? 'btn-ghost text-xs text-muted hover:text-danger'
                                  : 'btn-ghost text-xs text-success'
                              }
                              disabled={updateBranch.isPending}
                              onClick={() =>
                                updateBranch.mutate({
                                  id: b.id,
                                  patch: { isActive: !b.isActive },
                                })
                              }
                            >
                              {b.isActive ? 'ປິດໃຊ້' : 'ເປີດໃຊ້'}
                            </button>
                          )}
                          <RowActions
                            id={b.id}
                            editing={editingBranch}
                            confirming={confirmingBranch}
                            busy={updateBranch.isPending || removeBranch.isPending}
                            canSave={Boolean(editBranchName.trim())}
                            onEdit={() => {
                              setConfirmingBranch(null);
                              setEditingBranch(b.id);
                              setEditBranchName(b.nameLo);
                            }}
                            onSave={() =>
                              updateBranch.mutate({
                                id: b.id,
                                patch: { nameLo: editBranchName.trim() },
                              })
                            }
                            onCancel={() => {
                              setEditingBranch(null);
                              setConfirmingBranch(null);
                            }}
                            onAskDelete={() => {
                              setEditingBranch(null);
                              setConfirmingBranch(b.id);
                            }}
                            onDelete={() => removeBranch.mutate(b.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
