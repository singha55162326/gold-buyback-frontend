'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatWeight, formatDateTime, gramsToBaht } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { DateRangeFilter, useHistoryRange, type PagedResult } from '@/components/date-range';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { StatCard } from '@/components/stat-card';
import { NumberInput } from '@/components/number-input';
import { Dialog } from '@/components/dialog';
import { dec } from '@kpv/domain';

interface Line {
  nameLo: string;
  weightG: string;
  quantity: number;
}

interface Row {
  id: string;
  code: string;
  billId: string;
  customerName: string;
  staffName: string;
  totalWeightG: string;
  totalQuantity: number;
  status: 'HELD' | 'RETURNED';
  createdAt: string;
  customer: { phone: string };
  lines: Array<Line & { id: string }>;
  /** ວັນທີທີ່ກົດຢືນຢັນສົ່ງມອບຄືນ — ຫວ່າງໄວ້ຈົນກວ່າຈະສົ່ງຄືນ. */
  returnedAt: string | null;
  /** ຜູ້ບັນທຶກລາຍການຝາກນີ້. */
  createdBy: string;
  note?: string | null;
}

interface Payload extends PagedResult<Row> {
  totals: { totalWeightG: string; totalQuantity: number; billCount: number };
}

interface GoldItemCatalog {
  id: string;
  nameLo: string;
}

const DEFAULT_POPULAR_ITEMS = ['ສາຍຄໍ', 'ສາຍແຂນ', 'ແຫວນ', 'ຕ່າງຫູ', 'ກີ້', 'ຄຳແທ່ງ'];

/**
 * TOR §3.7 — Module ຝາກສິນຄ້າ.
 *
 * Gold held for a customer. It is deliberately kept out of Stock, WAC and
 * COH Gold: the shop holds it but does not own it.
 */
export default function ConsignmentsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Dialog visibility states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<Row | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form states for creating a deposit
  const [billId, setBillId] = useState('');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [staffName, setStaffName] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([{ nameLo: '', weightG: '', quantity: 1 }]);
  const [formError, setFormError] = useState<string | null>(null);

  // History query range
  const history = useHistoryRange<Row>(['finance', 'consignments'], '/finance/consignments');
  const data = history.data as Payload | undefined;

  // Active viewing item derived from history data
  const viewingRow = useMemo(() => {
    if (!viewingId || !data?.rows) return null;
    return data.rows.find((r) => r.id === viewingId) ?? null;
  }, [viewingId, data?.rows]);

  // Catalog items for autocomplete suggestions
  const goldItemsQ = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItemCatalog[]>('/catalog/gold-items'),
    staleTime: 5 * 60 * 1000,
  });

  const suggestedItemNames = useMemo(() => {
    const fromApi = (goldItemsQ.data ?? []).map((i) => i.nameLo.trim()).filter(Boolean);
    return Array.from(new Set([...DEFAULT_POPULAR_ITEMS, ...fromApi]));
  }, [goldItemsQ.data]);

  // Form field manipulation
  const setLine = (index: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const handleAddLine = () => {
    setLines((prev) => [...prev, { nameLo: '', weightG: '', quantity: 1 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuickAddItem = (itemName: string) => {
    setLines((prev) => {
      // If only one empty line exists, populate it
      if (prev.length === 1 && !prev[0].nameLo.trim() && !prev[0].weightG) {
        return [{ ...prev[0], nameLo: itemName }];
      }
      // If there's an unfilled line, fill the first one
      const emptyIdx = prev.findIndex((l) => !l.nameLo.trim());
      if (emptyIdx !== -1) {
        return prev.map((l, i) => (i === emptyIdx ? { ...l, nameLo: itemName } : l));
      }
      // Otherwise append new line
      return [...prev, { nameLo: itemName, weightG: '', quantity: 1 }];
    });
  };

  const resetForm = () => {
    setBillId('');
    setPhone('');
    setCustomerName('');
    const user = getStoredUser();
    setStaffName(user?.fullName ?? '');
    setNote('');
    setLines([{ nameLo: '', weightG: '', quantity: 1 }]);
    setFormError(null);
  };

  const handleOpenCreate = () => {
    const user = getStoredUser();
    if (!staffName && user?.fullName) {
      setStaffName(user.fullName);
    }
    setFormError(null);
    setIsCreateOpen(true);
  };

  // Calculations for running totals in create modal
  const formCalculations = useMemo(() => {
    let totalQty = 0;
    let totalWeightDec = dec(0);
    let validLineCount = 0;

    for (const line of lines) {
      const w = dec(line.weightG || 0);
      const q = Math.max(1, Math.trunc(Number(line.quantity) || 0) || 1);
      const isValid = line.nameLo.trim().length > 0 && w.gt(0);
      if (isValid) validLineCount++;
      if (w.gt(0)) {
        totalWeightDec = totalWeightDec.plus(w.mul(q));
        totalQty += q;
      }
    }

    return {
      validLineCount,
      totalQty,
      totalWeightG: totalWeightDec.toFixed(4),
      equivBaht: gramsToBaht(totalWeightDec.toFixed(4)),
    };
  }, [lines]);

  // Validation rules
  const isBillIdValid = /^\d{6}$/.test(billId);
  const isPhoneValid = /^\d{8}$/.test(phone);
  const isCustomerValid = customerName.trim().length > 0;
  const isStaffValid = staffName.trim().length > 0;
  const canSave =
    isBillIdValid &&
    isPhoneValid &&
    isCustomerValid &&
    isStaffValid &&
    formCalculations.validLineCount > 0;

  // Create consignment deposit mutation
  const create = useMutation({
    mutationFn: () => {
      const validLines = lines
        .filter((l) => l.nameLo.trim() && Number(l.weightG) > 0)
        .map((l) => ({
          nameLo: l.nameLo.trim(),
          weightG: l.weightG,
          quantity: Math.max(1, Math.trunc(Number(l.quantity) || 1)),
        }));

      return api.post('/finance/consignments', {
        billId: billId.trim(),
        phone: phone.trim(),
        customerName: customerName.trim(),
        staffName: staffName.trim(),
        note: note.trim() || undefined,
        lines: validLines,
      });
    },
    onSuccess: () => {
      setIsCreateOpen(false);
      toast.success('ດຳເນີນການສຳເລັດ', 'ບັນທຶກຮັບຝາກສິນຄ້າຮຽບຮ້ອຍແລ້ວ');
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['finance', 'consignments'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setFormError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  // Return consignment mutation
  const giveBack = useMutation({
    mutationFn: (id: string) => api.post(`/finance/consignments/${id}/return`),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ', 'ຢືນຢັນການສົ່ງມອບຄືນສິນຄ້າຮຽບຮ້ອຍແລ້ວ');
      setReturnTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['finance', 'consignments'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const copyToClipboard = (text: string, fieldId: string, label: string) => {
    if (!text || typeof navigator === 'undefined') return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    toast.success('ສຳເນົາແລ້ວ', `${label}: ${text}`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="ຝາກສິນຄ້າ"
        subtitle="ຄຳທີ່ລູກຄ້າຝາກໄວ້ກັບຮ້ານ — ບໍ່ນັບເຂົ້າ Stock ຫຼື COH Gold (TOR §3.7)"
        actions={
          <button
            type="button"
            className="btn-primary cursor-pointer transition-colors duration-150 inline-flex items-center gap-1.5"
            onClick={handleOpenCreate}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            + ສ້າງລາຍການຝາກ
          </button>
        }
      />

      {history.isError && <QueryErrorNotice error={history.error} onRetry={history.refetch} />}

      <div className="stat-grid">
        <StatCard
          label="ນໍ້າໜັກລວມ (ຝາກຢູ່)"
          value={data ? `${formatWeight(data.totals.totalWeightG)} g` : '—'}
        />
        <StatCard label="ຈຳນວນລວມ" value={data ? String(data.totals.totalQuantity) : '—'} />
        <StatCard label="ຈຳນວນບິນ" value={data ? String(data.totals.billCount) : '—'} />
      </div>

      {/* Main History Table */}
      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">History ຝາກສິນຄ້າ</h2>
        </div>
        <DateRangeFilter history={history} labelLo="ວັນທີຝາກ" />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="History ຝາກສິນຄ້າ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ລະຫັດບິນ</th>
                <th>ວັນທີຝາກ</th>
                <th>ເບີໂທ</th>
                <th>ຊື່ ລູກຄ້າ</th>
                <th className="text-right">ນໍ້າໜັກລວມ (g)</th>
                <th className="text-right">ຈຳນວນລວມ</th>
                <th>ຊື່ພະນັກງານ</th>
                <th>ວັນທີຢືນຢັນສົ່ງມອບ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={12}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={(data?.rows ?? []).length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການຝາກສິນຄ້າ"
                onRetry={history.refetch}
              />
              {(data?.rows ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs font-semibold">{row.code}</td>
                  <td className="font-mono text-xs">{row.billId}</td>
                  <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                  <td className="num">{row.customer.phone}</td>
                  <td className="font-medium">{row.customerName}</td>
                  <td className="num text-right font-medium">{formatWeight(row.totalWeightG)}</td>
                  <td className="num text-right">{row.totalQuantity}</td>
                  <td>{row.staffName}</td>
                  <td className={row.returnedAt ? 'whitespace-nowrap' : 'text-muted'}>
                    {row.returnedAt ? formatDateTime(row.returnedAt) : '—'}
                  </td>
                  <td>
                    <span className={statusClass(row.status, { HELD: 'status-warning' })}>
                      {row.status === 'HELD' ? 'ຝາກຢູ່' : 'ສົ່ງຄືນແລ້ວ'}
                    </span>
                  </td>
                  <td className="text-muted">{row.createdBy}</td>
                  <td className="text-right">
                    <div className="flex flex-nowrap justify-end gap-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        className="btn-ghost cursor-pointer transition-colors duration-150 inline-flex items-center gap-1 text-xs"
                        aria-label={`View ${row.code}`}
                        onClick={() => setViewingId(row.id)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View
                      </button>
                      {row.status === 'HELD' && (
                        <button
                          type="button"
                          className="btn-ghost text-success cursor-pointer transition-colors duration-150 inline-flex items-center gap-1 text-xs"
                          aria-label={`ຢືນຢັນສົ່ງຄືນ ${row.code}`}
                          onClick={() => setReturnTarget(row)}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          ສົ່ງຄືນ
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. Modal Form: ສ້າງລາຍການຝາກສິນຄ້າ (Create Consignment Deposit) */}
      {/* ========================================================================= */}
      <Dialog
        open={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setFormError(null);
        }}
        size="lg"
        dismissOnScrim={false}
        title="ຮັບຝາກສິນຄ້າ (ສ້າງລາຍການໃໝ່)"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted">
              {!canSave ? (
                <span className="text-warning">ກະລຸນາປ້ອນຂໍ້ມູນທີ່ຈຳເປັນໃຫ້ຄົບຖ້ວນ</span>
              ) : (
                <span className="text-success">ຂໍ້ມູນຄົບຖ້ວນ ພ້ອມບັນທຶກ</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary cursor-pointer transition-colors duration-150"
                onClick={() => {
                  setIsCreateOpen(false);
                  setFormError(null);
                }}
                disabled={create.isPending}
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary cursor-pointer transition-colors duration-150 inline-flex items-center gap-2 min-w-[140px] justify-center"
                disabled={!canSave || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    ກຳລັງບັນທຶກ...
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    ບັນທຶກຮັບຝາກ
                  </>
                )}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Section 1: ຂໍ້ມູນເອກະສານ & ລູກຄ້າ */}
          <div className="rounded-lg border border-line bg-surface/40 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              ຂໍ້ມູນເອກະສານ & ລູກຄ້າ
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* BILL ID */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="label mb-1" htmlFor="cons-billId">
                    ລະຫັດ / BILL ID <span className="text-danger">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-mono px-1 rounded ${
                      isBillIdValid
                        ? 'text-success bg-success/10'
                        : billId.length > 0
                          ? 'text-warning bg-warning/10'
                          : 'text-muted'
                    }`}
                  >
                    {billId.length}/6
                  </span>
                </div>
                <input
                  id="cons-billId"
                  className={`input num w-full font-mono tracking-wider ${
                    isBillIdValid ? 'border-success/50' : ''
                  }`}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000001"
                  value={billId}
                  onChange={(e) => setBillId(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <p className="mt-1 text-[11px] text-muted">ຕົວເລກ 6 ຫຼັກຕາມໃບບິນເຈ້ຍ</p>
              </div>

              {/* Customer Phone */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="label mb-1" htmlFor="cons-phone">
                    ເບີໂທລູກຄ້າ <span className="text-danger">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-mono px-1 rounded ${
                      isPhoneValid
                        ? 'text-success bg-success/10'
                        : phone.length > 0
                          ? 'text-warning bg-warning/10'
                          : 'text-muted'
                    }`}
                  >
                    {phone.length}/8
                  </span>
                </div>
                <input
                  id="cons-phone"
                  className={`input num w-full font-mono tracking-wider ${
                    isPhoneValid ? 'border-success/50' : ''
                  }`}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="20xxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
                <p className="mt-1 text-[11px] text-muted">8 ຕົວເລກ (ເຊັ່ນ 20xxxxxx)</p>
              </div>

              {/* Customer Name */}
              <div>
                <label className="label mb-1" htmlFor="cons-cust">
                  ຊື່ລູກຄ້າ <span className="text-danger">*</span>
                </label>
                <input
                  id="cons-cust"
                  className="input w-full"
                  placeholder="ຊື່ ແລະ ນາມສະກຸນ"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">ຊື່ຜູ້ຝາກສິນຄ້າ</p>
              </div>

              {/* Staff Name */}
              <div>
                <label className="label mb-1" htmlFor="cons-staff">
                  ຊື່ພະນັກງານຜູ້ຮັບ <span className="text-danger">*</span>
                </label>
                <input
                  id="cons-staff"
                  className="input w-full"
                  placeholder="ຊື່ພະນັກງານ"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">ພະນັກງານປະຈຳການ</p>
              </div>
            </div>
          </div>

          {/* Section 2: ລາຍການສິນຄ້າທີ່ຮັບຝາກ */}
          <div className="rounded-lg border border-line bg-surface/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  ລາຍການຄຳທີ່ຮັບຝາກ
                </span>
                <span className="badge recessed text-xs">
                  {lines.length} {lines.length > 1 ? 'ລາຍການ' : 'ລາຍການ'}
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary cursor-pointer transition-colors duration-150 inline-flex items-center gap-1.5 text-xs py-1 px-2.5"
                onClick={handleAddLine}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                + ເພີ່ມແຖວ
              </button>
            </div>

            {/* Quick preset chips */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted text-[11px] mr-1">ລາຍການຍອດນິຍົມ:</span>
              {suggestedItemNames.slice(0, 6).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="rounded border border-line bg-surface px-2 py-0.5 text-xs text-foreground hover:bg-recessed hover:border-accent transition-colors duration-150 cursor-pointer"
                  onClick={() => handleQuickAddItem(name)}
                >
                  + {name}
                </button>
              ))}
            </div>

            {/* Autocomplete datalist for item names */}
            <datalist id="consignment-items-datalist">
              {suggestedItemNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            {/* Lines Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto rounded border border-line bg-surface/30">
              <table className="w-full text-left text-xs">
                <thead className="bg-recessed/60 text-[11px] font-semibold text-muted uppercase border-b border-line">
                  <tr>
                    <th className="py-2 px-2.5 w-10 text-center">#</th>
                    <th className="py-2 px-2.5">
                      ລາຍການສິນຄ້າ <span className="text-danger">*</span>
                    </th>
                    <th className="py-2 px-2.5 w-44 text-right">
                      ນ້ຳໜັກ/ຊິ້ນ (g) <span className="text-danger">*</span>
                    </th>
                    <th className="py-2 px-2.5 w-28 text-center">ຈຳນວນ</th>
                    <th className="py-2 px-2.5 w-32 text-right">ນ້ຳໜັກລວມ (g)</th>
                    <th className="py-2 px-2.5 w-12 text-center">ລຶບ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lines.map((line, index) => {
                    const lineTotalWeight = dec(line.weightG || 0).mul(
                      Math.max(1, Math.trunc(Number(line.quantity) || 1)),
                    );
                    return (
                      <tr key={index} className="hover:bg-surface/60 transition-colors duration-150">
                        <td className="py-2 px-2.5 text-center font-mono text-muted">{index + 1}</td>
                        <td className="py-2 px-2.5">
                          <input
                            list="consignment-items-datalist"
                            className="input w-full text-xs h-8"
                            aria-label={`ລາຍການ ${index + 1}`}
                            placeholder="ຕົວຢ່າງ: ສາຍຄໍ, ແຫວນ..."
                            value={line.nameLo}
                            onChange={(e) => setLine(index, { nameLo: e.target.value })}
                          />
                        </td>
                        <td className="py-2 px-2.5">
                          <NumberInput
                            className="input num w-full text-right text-xs h-8"
                            aria-label={`ນ້ຳໜັກ (g) ${index + 1}`}
                            decimals={4}
                            unit="g"
                            placeholder="0.0000"
                            value={line.weightG}
                            onValueChange={(v) => setLine(index, { weightG: v })}
                          />
                        </td>
                        <td className="py-2 px-2.5">
                          <input
                            className="input num w-full text-center text-xs h-8"
                            aria-label={`ຈຳນວນ ${index + 1}`}
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              setLine(index, {
                                quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                              })
                            }
                          />
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-xs tabular-nums text-foreground font-medium">
                          {line.weightG && Number(line.weightG) > 0
                            ? formatWeight(lineTotalWeight.toFixed(4))
                            : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                            aria-label={`ລຶບລາຍການ ${index + 1}`}
                            disabled={lines.length === 1}
                            onClick={() => handleRemoveLine(index)}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lines Mobile Card View (< sm) */}
            <div className="sm:hidden space-y-2.5">
              {lines.map((line, index) => {
                const lineTotalWeight = dec(line.weightG || 0).mul(
                  Math.max(1, Math.trunc(Number(line.quantity) || 1)),
                );
                return (
                  <div key={index} className="rounded border border-line bg-surface/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-muted">
                        #{index + 1}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-danger hover:underline disabled:opacity-30 cursor-pointer"
                        disabled={lines.length === 1}
                        onClick={() => handleRemoveLine(index)}
                      >
                        ລຶບ
                      </button>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted block mb-1">
                        ລາຍການສິນຄ້າ <span className="text-danger">*</span>
                      </label>
                      <input
                        list="consignment-items-datalist"
                        className="input w-full text-xs"
                        placeholder="ຕົວຢ່າງ: ສາຍຄໍ, ແຫວນ..."
                        value={line.nameLo}
                        onChange={(e) => setLine(index, { nameLo: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-muted block mb-1">
                          ນ້ຳໜັກ/ຊິ້ນ (g) <span className="text-danger">*</span>
                        </label>
                        <NumberInput
                          className="input num w-full text-xs text-right"
                          decimals={4}
                          unit="g"
                          placeholder="0.0000"
                          value={line.weightG}
                          onValueChange={(v) => setLine(index, { weightG: v })}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted block mb-1">ຈຳນວນ</label>
                        <input
                          className="input num w-full text-xs text-center"
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            setLine(index, {
                              quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="pt-1 text-right text-xs text-muted">
                      ນ້ຳໜັກລວມແຖວ:{' '}
                      <span className="font-mono font-medium text-foreground">
                        {line.weightG && Number(line.weightG) > 0
                          ? `${formatWeight(lineTotalWeight.toFixed(4))} g`
                          : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Real-time Calculation Strip */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-lg border border-line bg-recessed/40 p-3">
              <div>
                <div className="text-[11px] text-muted">ຈຳນວນລາຍການ</div>
                <div className="text-sm font-bold">
                  {formCalculations.validLineCount}{' '}
                  <span className="text-xs font-normal text-muted">/ {lines.length} ແຖວ</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted">ຈຳນວນຊິ້ນລວມ</div>
                <div className="text-sm font-bold num">
                  {formCalculations.totalQty}{' '}
                  <span className="text-xs font-normal text-muted">ຊິ້ນ</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted">ນໍ້າໜັກລວມ (g)</div>
                <div className="text-sm font-bold num text-accent">
                  {formatWeight(formCalculations.totalWeightG)}{' '}
                  <span className="text-xs font-normal text-muted">g</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted">ທຽບເທົ່າບາດຄຳ</div>
                <div className="text-sm font-bold num">
                  {formCalculations.equivBaht}{' '}
                  <span className="text-xs font-normal text-muted">ບາດ</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: ໝາຍເຫດ (Optional) */}
          <div className="rounded-lg border border-line bg-surface/40 p-4">
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0" htmlFor="cons-note">
                ໝາຍເຫດເພີ່ມເຕີມ (ຖ້າມີ)
              </label>
              <span className="text-[10px] font-mono text-muted">{note.length}/500</span>
            </div>
            <textarea
              id="cons-note"
              className="input w-full text-xs py-2 h-16 resize-none"
              placeholder="ລາຍລະອຽດສະພາບສິນຄ້າ, ຂໍ້ຕົກລົງພິເສດ, ຫຼື ກຳນົດເວລາມາຮັບຄືນ..."
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Live Validation Guidance Checklist */}
          {!canSave && (
            <div className="rounded border border-line bg-surface/30 p-2.5 text-xs text-muted flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">ເງື່ອນໄຂການບັນທຶກ:</span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                  isBillIdValid ? 'text-success bg-success/10' : 'text-muted bg-recessed'
                }`}
              >
                {isBillIdValid ? '✓' : '•'} ລະຫັດບິນ 6 ໂຕ
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                  isPhoneValid ? 'text-success bg-success/10' : 'text-muted bg-recessed'
                }`}
              >
                {isPhoneValid ? '✓' : '•'} ເບີໂທ 8 ໂຕ
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                  isCustomerValid ? 'text-success bg-success/10' : 'text-muted bg-recessed'
                }`}
              >
                {isCustomerValid ? '✓' : '•'} ຊື່ລູກຄ້າ
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                  isStaffValid ? 'text-success bg-success/10' : 'text-muted bg-recessed'
                }`}
              >
                {isStaffValid ? '✓' : '•'} ຊື່ພະນັກງານ
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                  formCalculations.validLineCount > 0
                    ? 'text-success bg-success/10'
                    : 'text-muted bg-recessed'
                }`}
              >
                {formCalculations.validLineCount > 0 ? '✓' : '•'} ຢ່າງໜ້ອຍ 1 ລາຍການ
              </span>
            </div>
          )}

          {/* Server Error Notice */}
          {formError && (
            <div role="alert" className="notice status-danger text-xs">
              {formError}
            </div>
          )}
        </div>
      </Dialog>

      {/* ========================================================================= */}
      {/* 2. Modal View: ລາຍລະອຽດການຝາກສິນຄ້າ (Consignment Detail View) */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(viewingRow)}
        onClose={() => setViewingId(null)}
        title="ລາຍລະອຽດການຝາກສິນຄ້າ"
        size="lg"
        dismissOnScrim={true}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div>
              <button
                type="button"
                className="btn-secondary cursor-pointer transition-colors duration-150 inline-flex items-center gap-1.5 text-xs"
                onClick={() => window.print()}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                ພິມໃບຮັບຝາກ
              </button>
            </div>
            <div className="flex items-center gap-2">
              {viewingRow?.status === 'HELD' && (
                <button
                  type="button"
                  className="btn-primary cursor-pointer transition-colors duration-150 inline-flex items-center gap-1.5 text-xs"
                  onClick={() => {
                    if (viewingRow) {
                      setReturnTarget(viewingRow);
                    }
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  ຢືນຢັນສົ່ງມອບຄືນ
                </button>
              )}
              <button
                type="button"
                className="btn-secondary cursor-pointer transition-colors duration-150 text-xs"
                onClick={() => setViewingId(null)}
              >
                ປິດ
              </button>
            </div>
          </div>
        }
      >
        {viewingRow && (
          <div className="space-y-4">
            {/* Header Badge Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold text-base text-foreground">
                  {viewingRow.code}
                </span>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[11px] bg-recessed text-muted hover:text-foreground cursor-pointer transition-colors"
                  title="ສຳເນົາລະຫັດ"
                  onClick={() => copyToClipboard(viewingRow.code, 'code', 'ລະຫັດລາຍການ')}
                >
                  {copiedField === 'code' ? '✓ ສຳເນົາແລ້ວ' : 'Copy'}
                </button>
                <span className="badge recessed font-mono text-xs">
                  BILL ID: #{viewingRow.billId}
                </span>
              </div>
              <div>
                <span className={statusClass(viewingRow.status, { HELD: 'status-warning' })}>
                  {viewingRow.status === 'HELD' ? 'ຝາກຢູ່ (ຮັກສາໄວ້)' : 'ສົ່ງຄືນແລ້ວ'}
                </span>
              </div>
            </div>

            {/* Quick KPI Strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-surface/40 p-3">
                <div className="text-[11px] text-muted">ນໍ້າໜັກລວມ</div>
                <div className="text-base font-bold num text-accent">
                  {formatWeight(viewingRow.totalWeightG)}{' '}
                  <span className="text-xs font-normal text-muted">g</span>
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface/40 p-3">
                <div className="text-[11px] text-muted">ທຽບເທົ່າບາດຄຳ</div>
                <div className="text-base font-bold num">
                  {gramsToBaht(viewingRow.totalWeightG)}{' '}
                  <span className="text-xs font-normal text-muted">ບາດ</span>
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface/40 p-3">
                <div className="text-[11px] text-muted">ຈຳນວນຊິ້ນລວມ</div>
                <div className="text-base font-bold num">
                  {viewingRow.totalQuantity}{' '}
                  <span className="text-xs font-normal text-muted">ຊິ້ນ</span>
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface/40 p-3">
                <div className="text-[11px] text-muted">ຈຳນວນລາຍການ</div>
                <div className="text-base font-bold">
                  {viewingRow.lines.length}{' '}
                  <span className="text-xs font-normal text-muted">ລາຍການ</span>
                </div>
              </div>
            </div>

            {/* Information Grid: Customer & Processing */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Customer Box */}
              <div className="rounded-lg border border-line bg-surface/40 p-3.5 space-y-2 text-xs">
                <div className="font-semibold text-muted uppercase text-[11px] tracking-wider mb-1">
                  ຂໍ້ມູນລູກຄ້າ
                </div>
                <div className="flex items-center justify-between py-1 border-b border-line/60">
                  <span className="text-muted">ຊື່ລູກຄ້າ:</span>
                  <span className="font-medium text-foreground">{viewingRow.customerName}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted">ເບີໂທລະສັບ:</span>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`tel:${viewingRow.customer.phone}`}
                      className="font-mono text-accent hover:underline"
                    >
                      {viewingRow.customer.phone}
                    </a>
                    <button
                      type="button"
                      className="text-[10px] rounded px-1 py-0.5 bg-recessed text-muted hover:text-foreground cursor-pointer transition-colors"
                      title="ສຳເນົາເບີໂທ"
                      onClick={() =>
                        copyToClipboard(viewingRow.customer.phone, 'phone', 'ເບີໂທ')
                      }
                    >
                      {copiedField === 'phone' ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Processing & Handler Box */}
              <div className="rounded-lg border border-line bg-surface/40 p-3.5 space-y-2 text-xs">
                <div className="font-semibold text-muted uppercase text-[11px] tracking-wider mb-1">
                  ຂໍ້ມູນເຈົ້າໜ້າທີ່ & ເວລາ
                </div>
                <div className="flex items-center justify-between py-1 border-b border-line/60">
                  <span className="text-muted">ພະນັກງານຮັບຝາກ:</span>
                  <span className="font-medium text-foreground">{viewingRow.staffName}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-line/60">
                  <span className="text-muted">ຜູ້ບັນທຶກລະບົບ:</span>
                  <span className="text-muted">{viewingRow.createdBy}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-line/60">
                  <span className="text-muted">ວັນທີ-ເວລາຮັບຝາກ:</span>
                  <span className="font-mono">{formatDateTime(viewingRow.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted">ວັນທີສົ່ງມອບຄືນ:</span>
                  <span
                    className={
                      viewingRow.returnedAt
                        ? 'font-mono text-success font-medium'
                        : 'text-muted italic'
                    }
                  >
                    {viewingRow.returnedAt
                      ? formatDateTime(viewingRow.returnedAt)
                      : 'ຍັງບໍ່ທັນສົ່ງຄືນ (ສິນຄ້າຢູ່ໃນຮ້ານ)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Note box if exists */}
            {viewingRow.note && (
              <div className="rounded-lg border border-line bg-surface/30 p-3 text-xs">
                <div className="text-muted text-[11px] font-semibold uppercase mb-1">ໝາຍເຫດ:</div>
                <p className="text-foreground whitespace-pre-wrap">{viewingRow.note}</p>
              </div>
            )}

            {/* Detailed Items Table */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                ລາຍການຄຳທີ່ຝາກໄວ້
              </div>
              <div className="overflow-x-auto rounded-lg border border-line bg-surface/30">
                <table className="w-full text-left text-xs">
                  <thead className="bg-recessed/60 text-[11px] font-semibold text-muted uppercase border-b border-line">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">ລາຍການສິນຄ້າ</th>
                      <th className="py-2.5 px-3 text-right">ນ້ຳໜັກ / ຊິ້ນ (g)</th>
                      <th className="py-2.5 px-3 text-center">ຈຳນວນ</th>
                      <th className="py-2.5 px-3 text-right">ນ້ຳໜັກລວມ (g)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {viewingRow.lines.map((line, idx) => {
                      const lineTotal = dec(line.weightG).mul(line.quantity);
                      return (
                        <tr key={line.id} className="hover:bg-surface/50 transition-colors">
                          <td className="py-2.5 px-3 text-center font-mono text-muted">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-medium text-foreground">{line.nameLo}</td>
                          <td className="py-2.5 px-3 text-right num text-foreground">
                            {formatWeight(line.weightG)}
                          </td>
                          <td className="py-2.5 px-3 text-center num text-foreground">
                            {line.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground">
                            {formatWeight(lineTotal.toFixed(4))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-line bg-recessed/40 font-semibold text-foreground">
                    <tr>
                      <td colSpan={2} className="py-2 px-3 text-right">
                        ລວມທັງໝົດ:
                      </td>
                      <td className="py-2 px-3 text-right text-muted">—</td>
                      <td className="py-2 px-3 text-center num">{viewingRow.totalQuantity}</td>
                      <td className="py-2 px-3 text-right font-mono text-accent">
                        {formatWeight(viewingRow.totalWeightG)} g
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* ========================================================================= */}
      {/* 3. Modal Return Confirmation: ຢືນຢັນສົ່ງຄືນສິນຄ້າ (Return Confirmation) */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(returnTarget)}
        onClose={() => setReturnTarget(null)}
        title="ຢືນຢັນການສົ່ງມອບຄືນສິນຄ້າ"
        size="md"
        dismissOnScrim={true}
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              type="button"
              className="btn-secondary cursor-pointer transition-colors duration-150 text-xs"
              onClick={() => setReturnTarget(null)}
              disabled={giveBack.isPending}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary cursor-pointer transition-colors duration-150 inline-flex items-center gap-1.5 text-xs"
              disabled={giveBack.isPending}
              onClick={() => {
                if (returnTarget) giveBack.mutate(returnTarget.id);
              }}
            >
              {giveBack.isPending ? 'ກຳລັງດຳເນີນການ...' : 'ຢືນຢັນສົ່ງຄືນສິນຄ້າ'}
            </button>
          </div>
        }
      >
        {returnTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-xs text-foreground">
              <div className="font-semibold text-warning mb-1 flex items-center gap-1.5">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                ກະລຸນາກວດສອບລາຍການກ່ອນຢືນຢັນ
              </div>
              <p className="text-muted leading-relaxed">
                ເມື່ອຢືນຢັນການສົ່ງມອບຄືນແລ້ວ ສະຖານະຈະປ່ຽນເປັນ &quot;ສົ່ງຄືນແລ້ວ&quot; ແລະ
                ບັນທຶກເວລາສົ່ງມອບຄືນທັນທີ.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface/50 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-line/60">
                <span className="text-muted">ລະຫັດລາຍການ:</span>
                <span className="font-mono font-semibold">{returnTarget.code}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line/60">
                <span className="text-muted">ລະຫັດບິນ (BILL ID):</span>
                <span className="font-mono font-semibold">#{returnTarget.billId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line/60">
                <span className="text-muted">ຊື່ລູກຄ້າ:</span>
                <span className="font-medium">
                  {returnTarget.customerName} ({returnTarget.customer.phone})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line/60">
                <span className="text-muted">ຈຳນວນລາຍການ:</span>
                <span className="font-medium">
                  {returnTarget.totalQuantity} ຊິ້ນ ({returnTarget.lines.length} ລາຍການ)
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">ນໍ້າໜັກລວມ:</span>
                <span className="font-bold text-accent num text-sm">
                  {formatWeight(returnTarget.totalWeightG)} g
                </span>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
