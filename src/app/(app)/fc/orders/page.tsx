'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser, type SessionUser } from '@/lib/api';
import { formatLak, formatWeight, formatDate, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { NumberInput } from '@/components/number-input';
import { MultiPayment, newPaymentLines, paymentPayload, calcTotalLak, type PaymentLine, type Rates, type PayCurrency } from '@/components/multi-payment';
import { statusClass } from '@/lib/status';
import type { PagedResult } from '@/components/date-range';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { Dialog } from '@/components/dialog';

interface GoldItem { id: string; nameLo: string }
interface Partner { id: string; nameLo: string }
interface Bank { id: string; nameLo: string }

type OrderStatus =
  | 'ORDER_PLACED'
  | 'SENT_TO_SMITH'
  | 'RECEIVED_FROM_SMITH'
  | 'AWAITING_PICKUP'
  | 'COMPLETED'
  | 'CANCELLED';

/** ແຖວລາຍການໃນຟອມສ້າງ Order. */
interface FormLine {
  goldItemId: string;
  weightG: string;
  quantity: string;
  amount: string;
}

const emptyLine = (): FormLine => ({ goldItemId: '', weightG: '', quantity: '1', amount: '' });

/** ຈຳນວນທີ່ພິມຍັງບໍ່ຄົບ ນັບເປັນ 1. */
const qty = (value: string) => Math.max(1, Math.trunc(Number(value) || 0) || 1);

interface Order {
  id: string; code: string; billNo: string; productType: 'IT' | 'ITP';
  staffName: string; weightG: string; quantity: number;
  totalAmount: string; receivedAmount: string; balanceAmount: string;
  status: OrderStatus; note: string | null; createdAt: string;
  sentToSmithAt: string | null;
  /** ຜູ້ບັນທຶກ Order ນີ້. */
  createdBy: string;
  /** ລາຍການໃນບິນ — ບິນດຽວມີໄດ້ຫຼາຍແຖວ. */
  lines: Array<{
    id: string;
    weightG: string;
    quantity: number;
    amount: string | null;
    goldItem: { nameLo: string };
  }>;
  receivedFromSmithAt: string | null; customerPickupAt: string | null; completedAt?: string | null;
  /** ການຮັບ / ຈ່າຍຄືນເງິນຂອງບິນນີ້ — ສະແດງພ້ອມສະກຸນເງິນ. */
  receipts: Array<{
    id: string;
    method: 'CASH' | 'BANK';
    currency: 'LAK' | 'THB' | 'USD';
    amount: string;
    amountLak: string;
    isRefund: boolean;
    isDeposit: boolean;
    createdAt: string;
    bankAccount: { nameLo: string } | null;
  }>;
  customer: { phone: string };
  goldItemId?: string;
  goldItem: { id?: string; nameLo: string };
  supplierId?: string | null;
  supplier: { id?: string; nameLo: string } | null;
}

const STATUS: Record<OrderStatus, { lo: string }> = {
  ORDER_PLACED: { lo: 'Order ສຳເລັດ' },
  SENT_TO_SMITH: { lo: 'ສັ່ງຊ່າງ ສຳເລັດ' },
  RECEIVED_FROM_SMITH: { lo: 'ຮັບເຄື່ອງຈາກຊ່າງ ສຳເລັດ' },
  AWAITING_PICKUP: { lo: 'ລໍຖ້າລູກຄ້າຮັບເຄື່ອງ' },
  COMPLETED: { lo: 'Completed' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

/** The one step each status may advance to (TOR §7). */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  ORDER_PLACED: 'SENT_TO_SMITH',
  SENT_TO_SMITH: 'RECEIVED_FROM_SMITH',
  RECEIVED_FROM_SMITH: 'AWAITING_PICKUP',
  AWAITING_PICKUP: 'COMPLETED',
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * TOR §7 — ລາຍການ Order.
 *
 * Each transition captures the fact that makes it true: a Supplier for
 * ສັ່ງຊ່າງ, a date for ຮັບເຄື່ອງຈາກຊ່າງ, a date for ລູກຄ້າມາຮັບເຄື່ອງ. The API
 * rejects the transition without them, so this form collects them rather than
 * letting a status be set on trust.
 */

/** ສະຫຼຸບສະກຸນເງິນທີ່ໄດ້ຮັບ ແລະ ຍອດເງິນຕົວຈິງໃນສະກຸນເງິນນັ້ນ. */
function getOrderReceiptSummary(order: Order) {
  const received = (order.receipts ?? []).filter((r) => !r.isRefund);
  const refunds = (order.receipts ?? []).filter((r) => r.isRefund);

  if (received.length === 0) {
    const match = order.note?.match(/\[TOTAL:\s*[\d,.]+\s*(THB|USD|LAK)\]/);
    return {
      currency: (match ? match[1] : 'LAK') as PayCurrency,
      amountDisplay: '0',
      amountLak: Number(order.receivedAmount) || 0,
      netAmount: 0,
    };
  }

  const currencies = Array.from(new Set(received.map((r) => r.currency)));

  if (currencies.length === 1) {
    const cur = currencies[0] as PayCurrency;
    const totalInCur = received.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const refundInCur = refunds.filter((r) => r.currency === cur).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const net = Math.max(0, totalInCur - refundInCur);
    return {
      currency: cur,
      amountDisplay: formatByCurrency(String(net), cur),
      amountLak: Number(order.receivedAmount) || 0,
      netAmount: net,
    };
  }

  const multiText = currencies
    .map((cur) => {
      const sum = received.filter((r) => r.currency === cur).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const ref = refunds.filter((r) => r.currency === cur).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const net = Math.max(0, sum - ref);
      return `${formatByCurrency(String(net), cur)} ${cur}`;
    })
    .join(' + ');

  const totalNet = currencies.reduce((sum, cur) => {
    const s = received.filter((r) => r.currency === cur).reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const ref = refunds.filter((r) => r.currency === cur).reduce((a, b) => a + (Number(b.amount) || 0), 0);
    return sum + Math.max(0, s - ref);
  }, 0);

  return {
    currency: currencies.join(', '),
    amountDisplay: multiText,
    amountLak: Number(order.receivedAmount) || 0,
    netAmount: totalNet,
  };
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [advancing, setAdvancing] = useState<Order | null>(null);
  const [paying, setPaying] = useState<Order | null>(null);
  // ຈ່າຍເງິນຄືນທີ່ຮັບຈາກລູກຄ້າ (ຕອນມາຮັບເຄື່ອງ) ແລະ ລາຍລະອຽດ Order.
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [refundPayments, setRefundPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Admin user check
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    setUser(getStoredUser());
  }, []);
  const isAdmin = user?.role === 'ADMIN';

  // Admin Edit and Delete state
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editBillNo, setEditBillNo] = useState('');
  const [editProductType, setEditProductType] = useState<'IT' | 'ITP'>('IT');
  const [editStaffName, setEditStaffName] = useState('');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editStatus, setEditStatus] = useState<OrderStatus>('ORDER_PLACED');
  const [editLines, setEditLines] = useState<FormLine[]>([emptyLine()]);
  const setEditLine = (i: number, patch: Partial<FormLine>) =>
    setEditLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const [editTotalAmount, setEditTotalAmount] = useState('');
  const [editOrderCurrency, setEditOrderCurrency] = useState<PayCurrency>('LAK');
  const [isEditCustomTotal, setIsEditCustomTotal] = useState(false);
  const [editPayments, setEditPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // create form state
  const [phone, setPhone] = useState('');
  const [billNo, setBillNo] = useState('');
  const [productType, setProductType] = useState<'IT' | 'ITP'>('IT');
  const [staffName, setStaffName] = useState('');
  // ບິນດຽວ Add ລາຍການໄດ້ຫຼາຍແຖວ (TOR §7 ຕາມທີ່ລູກຄ້າແຈ້ງ).
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const setLine = (i: number, patch: Partial<FormLine>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const [totalAmount, setTotalAmount] = useState('');
  const [orderCurrency, setOrderCurrency] = useState<PayCurrency>('LAK');
  const [isCustomTotal, setIsCustomTotal] = useState(false);
  const [note, setNote] = useState('');

  // shared receipt fields
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [payPayments, setPayPayments] = useState<PaymentLine[]>(newPaymentLines());

  // transition fields
  const [supplierId, setSupplierId] = useState('');
  const [transitionDate, setTransitionDate] = useState(today());

  // Auto-fill logged-in staff name if available
  useEffect(() => {
    const user = getStoredUser();
    if (user?.fullName && !staffName) {
      setStaffName(user.fullName);
    }
  }, []);

  const goldItemsQuery = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });
  const goldItems = goldItemsQuery.data ?? [];
  const partnersQuery = useQuery({
    queryKey: ['catalog', 'partners'],
    queryFn: () => api.get<Partner[]>('/catalog/partners'),
  });
  const partners = partnersQuery.data ?? [];
  const banksQuery = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const banks = banksQuery.data ?? [];

  const ratesQuery = useQuery({
    queryKey: ['rates', 'current'],
    queryFn: () => api.get<Rates>('/rates/current'),
    retry: false,
  });
  const rates = ratesQuery.data ?? null;

  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<Order>(['orders'], '/orders');
  const orders = history.rows;
  const catalogQuery = [goldItemsQuery, partnersQuery, banksQuery].find((q) => q.isError);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
  };

  /** ແຖວທີ່ຄົບພໍຈະສົ່ງໄປ server — ຕ້ອງມີລາຍການ ແລະ ນ້ຳໜັກ. */
  const orderLines = lines
    .filter((l) => l.goldItemId && Number(l.weightG) > 0)
    .map((l) => ({
      goldItemId: l.goldItemId,
      weightG: l.weightG.trim(),
      quantity: qty(l.quantity),
      amount: l.amount.replace(/,/g, '').trim() || undefined,
    }));

  const create = useMutation({
    mutationFn: () => {
      let finalNote = note.trim();
      if (orderCurrency !== 'LAK' && numTotalInput > 0) {
        const currTag = `[TOTAL: ${formatByCurrency(totalAmount, orderCurrency)} ${orderCurrency}]`;
        finalNote = finalNote ? `${finalNote} ${currTag}` : currTag;
      }
      return api.post('/orders', {
        phone, billNo, productType, staffName,
        lines: orderLines,
        totalAmount: String(Math.round(totalInLak)),
        note: finalNote || undefined,
        receipts: paymentPayload(payments),
      });
    },
    onSuccess: () => {
      toast.success('ສ້າງ Order ສຳເລັດ');
      setShowAdd(false);
      setLines([emptyLine()]);
      setPhone('');
      setBillNo('');
      setTotalAmount('');
      setOrderCurrency('LAK');
      setIsCustomTotal(false);
      setPayments(newPaymentLines('LAK'));
      setNote('');
      setError(null);
      invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const advance = useMutation({
    mutationFn: async (order: Order) => {
      const status = NEXT[order.status]!;
      const body: Record<string, unknown> = { status };
      if (status === 'SENT_TO_SMITH') body.supplierId = supplierId;
      if (status === 'RECEIVED_FROM_SMITH') body.receivedFromSmithAt = transitionDate;
      if (status === 'COMPLETED') body.customerPickupAt = transitionDate;

      // ຫາກເປັນຂັ້ນຕອນ COMPLETED ແລະ ມີຍອດຈ່າຍເງິນຄືນ ໃຫ້ສົ່ງ refund ໄປພ້ອມກັນ
      if (status === 'COMPLETED') {
        const summary = getOrderReceiptSummary(order);
        const refundPayload = paymentPayload(refundPayments);
        if (summary.netAmount > 0.0001 && refundPayload.length > 0) {
          await api.post(`/orders/${order.id}/refund`, { receipts: refundPayload });
        }
      }

      return api.patch(`/orders/${order.id}/status`, body);
    },
    onSuccess: (_, order) => {
      const status = NEXT[order.status]!;
      const summary = getOrderReceiptSummary(order);
      if (status === 'COMPLETED' && summary.netAmount > 0.0001 && paymentPayload(refundPayments).length > 0) {
        toast.success('Completed ແລະ ຈ່າຍເງິນຄືນສຳເລັດ');
      } else {
        toast.success('ດຳເນີນການສຳເລັດ');
      }
      setAdvancing(null);
      setSupplierId('');
      setTransitionDate(today());
      setRefundPayments(newPaymentLines());
      setError(null);
      invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const refund = useMutation({
    mutationFn: (row: Order) =>
      api.post(`/orders/${row.id}/refund`, { receipts: paymentPayload(refundPayments) }),
    onSuccess: () => {
      toast.success('ຈ່າຍເງິນຄືນແລ້ວ');
      setRefunding(null); setRefundPayments(newPaymentLines()); setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຈ່າຍເງິນຄືນບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pay = useMutation({
    mutationFn: (order: Order) =>
      api.post(`/orders/${order.id}/receipts`, {
        receipts: paymentPayload(payPayments),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setPaying(null); setPayPayments(newPaymentLines()); setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຮັບເງິນບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  // Every leg must name a bank when it is a transfer, and carry an amount.
  const legsReady = (lines: PaymentLine[]) =>
    paymentPayload(lines).length > 0 &&
    lines.every((l) => l.method === 'CASH' || !l.amount.trim() || Boolean(l.bankAccountId));

  const rateForTotal = (currency: PayCurrency): number => {
    if (currency === 'LAK') return 1;
    if (!rates) return 0;
    const key = `${currency.toLowerCase()}SellRate` as keyof Rates;
    return Number(rates[key] ?? 0);
  };
  const currentTotalRate = rateForTotal(orderCurrency);

  // Live item calculations
  const totalWeight = lines.reduce((s, l) => s + (Number(l.weightG) || 0) * qty(l.quantity), 0);
  const totalQty = lines.reduce((s, l) => s + qty(l.quantity), 0);

  // Live deposit calculations in the single selected order currency
  const depositInOrderCurrency = useMemo(() => {
    return payments.reduce((sum, p) => {
      const n = Number(p.amount.replace(/,/g, '').trim());
      return Number.isFinite(n) && n > 0 ? sum + n : sum;
    }, 0);
  }, [payments]);

  // Convert deposit to LAK equivalent
  const depositTotalLak = useMemo(() => {
    if (orderCurrency === 'LAK') return depositInOrderCurrency;
    return currentTotalRate > 0 ? Math.round(depositInOrderCurrency * currentTotalRate) : 0;
  }, [depositInOrderCurrency, orderCurrency, currentTotalRate]);

  // Convert entered total amount in orderCurrency to LAK equivalent
  const numTotalInput = Number(totalAmount.replace(/,/g, '')) || 0;
  const totalInLak = useMemo(() => {
    if (orderCurrency === 'LAK') return numTotalInput;
    return currentTotalRate > 0 ? Math.round(numTotalInput * currentTotalRate) : 0;
  }, [numTotalInput, orderCurrency, currentTotalRate]);

  // Sync TOTAL automatically with deposit sum in the selected currency
  useEffect(() => {
    if (!isCustomTotal) {
      if (depositInOrderCurrency <= 0) {
        setTotalAmount('');
      } else {
        const val =
          orderCurrency === 'LAK'
            ? Math.round(depositInOrderCurrency)
            : Math.round(depositInOrderCurrency * 100) / 100;
        setTotalAmount(String(val));
      }
    }
  }, [depositInOrderCurrency, isCustomTotal, orderCurrency]);

  const balanceLak = Math.max(0, totalInLak - depositTotalLak);

  // Switch order currency (once per order creation)
  const changeOrderCurrency = (newCurr: PayCurrency) => {
    if (newCurr === orderCurrency) return;
    const oldRate = rateForTotal(orderCurrency);
    const newRate = rateForTotal(newCurr);

    if (isCustomTotal && numTotalInput > 0 && oldRate > 0 && newRate > 0) {
      const amountInLak = orderCurrency === 'LAK' ? numTotalInput : numTotalInput * oldRate;
      const converted =
        newCurr === 'LAK'
          ? Math.round(amountInLak)
          : Math.round((amountInLak / newRate) * 100) / 100;
      setTotalAmount(String(converted));
    }
    setOrderCurrency(newCurr);
    setPayments((prev) => prev.map((l) => ({ ...l, currency: newCurr })));
  };

  const syncWithDeposit = () => {
    setIsCustomTotal(false);
    if (depositInOrderCurrency <= 0) {
      setTotalAmount('');
    } else {
      const val =
        orderCurrency === 'LAK'
          ? Math.round(depositInOrderCurrency)
          : Math.round(depositInOrderCurrency * 100) / 100;
      setTotalAmount(String(val));
    }
  };

  // Validation breakdown for clear user feedback
  const isPhoneValid = /^\d{8}$/.test(phone);
  const isBillNoValid = /^\d{6}$/.test(billNo);
  const isStaffValid = Boolean(staffName.trim());
  const isLinesValid = orderLines.length > 0;
  const isTotalValid = totalInLak > 0;
  const isPaymentValid = legsReady(payments);
  const isDepositValid = totalInLak >= depositTotalLak;

  const canSave =
    isPhoneValid &&
    isBillNoValid &&
    isStaffValid &&
    isLinesValid &&
    isTotalValid &&
    isPaymentValid &&
    isDepositValid;

  const openCreateModal = () => {
    const user = getStoredUser();
    if (user?.fullName && !staffName) {
      setStaffName(user.fullName);
    }
    setOrderCurrency('LAK');
    setPayments(newPaymentLines('LAK'));
    setIsCustomTotal(false);
    setShowAdd(true);
    setPaying(null);
    setAdvancing(null);
    setRefunding(null);
    setError(null);
  };

  const closeCreateModal = () => {
    setShowAdd(false);
    setError(null);
  };


  // Edit form financial helpers & calculations
  const currentEditTotalRate = rateForTotal(editOrderCurrency);
  const editTotalWeight = editLines.reduce((s, l) => s + (Number(l.weightG) || 0) * qty(l.quantity), 0);
  const editTotalQty = editLines.reduce((s, l) => s + qty(l.quantity), 0);

  const editDepositInOrderCurrency = useMemo(() => {
    return editPayments.reduce((sum, p) => {
      const n = Number(p.amount.replace(/,/g, '').trim());
      return Number.isFinite(n) && n > 0 ? sum + n : sum;
    }, 0);
  }, [editPayments]);

  const editDepositTotalLak = useMemo(() => {
    if (editOrderCurrency === 'LAK') return editDepositInOrderCurrency;
    return currentEditTotalRate > 0 ? Math.round(editDepositInOrderCurrency * currentEditTotalRate) : 0;
  }, [editDepositInOrderCurrency, editOrderCurrency, currentEditTotalRate]);

  const numEditTotalInput = Number(editTotalAmount.replace(/,/g, '')) || 0;
  const editTotalInLak = useMemo(() => {
    if (editOrderCurrency === 'LAK') return numEditTotalInput;
    return currentEditTotalRate > 0 ? Math.round(numEditTotalInput * currentEditTotalRate) : 0;
  }, [numEditTotalInput, editOrderCurrency, currentEditTotalRate]);

  useEffect(() => {
    if (editingOrder && !isEditCustomTotal) {
      if (editDepositInOrderCurrency <= 0) {
        setEditTotalAmount('');
      } else {
        const val =
          editOrderCurrency === 'LAK'
            ? Math.round(editDepositInOrderCurrency)
            : Math.round(editDepositInOrderCurrency * 100) / 100;
        setEditTotalAmount(String(val));
      }
    }
  }, [editDepositInOrderCurrency, isEditCustomTotal, editOrderCurrency, editingOrder]);

  const editBalanceLak = Math.max(0, editTotalInLak - editDepositTotalLak);

  const changeEditOrderCurrency = (newCurr: PayCurrency) => {
    if (newCurr === editOrderCurrency) return;
    const oldRate = rateForTotal(editOrderCurrency);
    const newRate = rateForTotal(newCurr);

    if (isEditCustomTotal && numEditTotalInput > 0 && oldRate > 0 && newRate > 0) {
      const amountInLak = editOrderCurrency === 'LAK' ? numEditTotalInput : numEditTotalInput * oldRate;
      const converted =
        newCurr === 'LAK'
          ? Math.round(amountInLak)
          : Math.round((amountInLak / newRate) * 100) / 100;
      setEditTotalAmount(String(converted));
    }
    setEditOrderCurrency(newCurr);
    setEditPayments((prev) => prev.map((l) => ({ ...l, currency: newCurr })));
  };

  const syncEditWithDeposit = () => {
    setIsEditCustomTotal(false);
    if (editDepositInOrderCurrency <= 0) {
      setEditTotalAmount('');
    } else {
      const val =
        editOrderCurrency === 'LAK'
          ? Math.round(editDepositInOrderCurrency)
          : Math.round(editDepositInOrderCurrency * 100) / 100;
      setEditTotalAmount(String(val));
    }
  };

  const openEditModal = (order: Order) => {
    setEditingOrder(order);
    setEditPhone(order.customer.phone);
    setEditBillNo(order.billNo);
    setEditProductType(order.productType);
    setEditStaffName(order.staffName);
    setEditSupplierId(order.supplier?.id ?? order.supplierId ?? '');
    setEditStatus(order.status);

    // Detect currency: check receipts first, then note tag [TOTAL: ... CUR]
    const received = (order.receipts ?? []).filter((r) => !r.isRefund);
    let detectedCurrency: PayCurrency = 'LAK';
    if (received.length > 0 && (['LAK', 'THB', 'USD'] as string[]).includes(received[0].currency)) {
      detectedCurrency = received[0].currency as PayCurrency;
    } else {
      const match = order.note?.match(/\[TOTAL:\s*[\d,.]+\s*(THB|USD|LAK)\]/);
      if (match && (['LAK', 'THB', 'USD'] as string[]).includes(match[1])) {
        detectedCurrency = match[1] as PayCurrency;
      }
    }
    setEditOrderCurrency(detectedCurrency);

    // Populate payment lines in detected currency
    if (received.length > 0) {
      setEditPayments(
        received.map((r: any) => ({
          id: r.id || crypto.randomUUID(),
          method: r.method,
          bankAccountId: r.bankAccountId || r.bankAccount?.id || '',
          currency: detectedCurrency,
          amount: r.amount ? String(r.amount) : '',
        }))
      );
    } else {
      setEditPayments(newPaymentLines(detectedCurrency));
    }

    // Populate total amount in that currency
    let initialTotalInCur = 0;
    const totalMatch = order.note?.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
    if (totalMatch && totalMatch[2] === detectedCurrency) {
      initialTotalInCur = Number(totalMatch[1].replace(/,/g, '')) || 0;
      setEditTotalAmount(totalMatch[1].replace(/,/g, ''));
    } else if (detectedCurrency === 'LAK') {
      initialTotalInCur = Number(order.totalAmount) || 0;
      setEditTotalAmount(order.totalAmount ? String(order.totalAmount).replace(/,/g, '') : '');
    } else {
      const rate = rateForTotal(detectedCurrency);
      initialTotalInCur = rate > 0 ? Math.round((Number(order.totalAmount) / rate) * 100) / 100 : Number(order.totalAmount) || 0;
      setEditTotalAmount(String(initialTotalInCur));
    }

    // Deposit sum in detected currency
    const initialDepositSum = received.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const orderTotalLak = Number(order.totalAmount) || 0;
    const orderRcvdLak = Number(order.receivedAmount) || 0;
    const hasRemainingBalance = orderTotalLak - orderRcvdLak > 1;

    // Auto-sync with deposit if the order was created with total = deposit (balance == 0)
    const isCustom = hasRemainingBalance && Math.abs(initialTotalInCur - initialDepositSum) > 0.01;
    setIsEditCustomTotal(isCustom);

    const cleanNote = (order.note ?? '').replace(/\[TOTAL:\s*[\d,.]+\s*(THB|USD|LAK)\]\s*/g, '').trim();
    setEditNote(cleanNote);
    setEditError(null);

    if (order.lines && order.lines.length > 0) {
      setEditLines(
        order.lines.map((l: any) => ({
          goldItemId: l.goldItemId || l.goldItem?.id || '',
          weightG: String(l.weightG),
          quantity: String(l.quantity),
          amount: l.amount ? String(l.amount) : '',
        }))
      );
    } else {
      setEditLines([
        {
          goldItemId: order.goldItemId || order.goldItem?.id || '',
          weightG: String(order.weightG),
          quantity: String(order.quantity),
          amount: '',
        },
      ]);
    }
  };

  const updateOrderMutation = useMutation({
    mutationFn: () => {
      if (!editingOrder) throw new Error('No order selected');
      const formattedLines = editLines
        .filter((l) => l.goldItemId && Number(l.weightG) > 0)
        .map((l) => ({
          goldItemId: l.goldItemId,
          weightG: l.weightG.trim(),
          quantity: qty(l.quantity),
          amount: l.amount.replace(/,/g, '').trim() || undefined,
        }));
      const finalNote =
        editOrderCurrency !== 'LAK' && numEditTotalInput > 0
          ? `[TOTAL: ${formatByCurrency(numEditTotalInput, editOrderCurrency)} ${editOrderCurrency}] ${editNote.trim()}`.trim()
          : editNote.trim();
      return api.patch(`/orders/${editingOrder.id}`, {
        phone: editPhone,
        billNo: editBillNo,
        productType: editProductType,
        staffName: editStaffName,
        supplierId: editSupplierId || null,
        status: editStatus,
        totalAmount: String(Math.round(editTotalInLak)),
        note: finalNote || null,
        lines: formattedLines,
        receipts: paymentPayload(editPayments),
      });
    },
    onSuccess: () => {
      toast.success('ແກ້ໄຂ Order ສຳເລັດ');
      setEditingOrder(null);
      invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ';
      setEditError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/orders/${id}`),
    onSuccess: () => {
      toast.success('ລຶບ Order ສຳເລັດ');
      setDeletingOrder(null);
      invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ';
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const isEditPhoneValid = /^\d{8}$/.test(editPhone);
  const isEditBillNoValid = /^\d{6}$/.test(editBillNo);
  const isEditStaffValid = Boolean(editStaffName.trim());
  const editOrderLines = editLines.filter((l) => l.goldItemId && Number(l.weightG) > 0);
  const isEditLinesValid = editOrderLines.length > 0;
  const isEditTotalValid = editTotalInLak > 0;
  const isEditPaymentValid = legsReady(editPayments);
  const isEditDepositValid = editTotalInLak >= editDepositTotalLak;
  const canSaveEdit =
    isEditPhoneValid &&
    isEditBillNoValid &&
    isEditStaffValid &&
    isEditLinesValid &&
    isEditTotalValid &&
    isEditPaymentValid &&
    isEditDepositValid;

  const pager = usePagination(orders);

  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຍການ Order"
        subtitle="ສັ່ງເຮັດຄຳຕາມສັ່ງ — ເງິນມັດຈໍາເຂົ້າ Module Advace ຈົນກວ່າລູກຄ້າຮັບເຄື່ອງ (TOR §7)"
        actions={
          <button className="btn-primary" onClick={openCreateModal}>
            + ສ້າງ Order
          </button>
        }
      />

      {error && !showAdd && (
        <div id="orders-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {catalogQuery && (
        <QueryErrorNotice error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
      )}

      {/* POP-UP MODAL: ສ້າງ Order ໃໝ່ */}
      <Dialog
        open={showAdd}
        onClose={closeCreateModal}
        title="ສ້າງ Order ໃໝ່"
        size="lg"
        dismissOnScrim={false}
        footer={
          <div className="flex w-full items-center justify-between">
            <div>
              {depositInOrderCurrency > 0 && (
                <div className="text-xs text-muted">
                  ມັດຈໍາ: <strong className="text-success num">{formatByCurrency(depositInOrderCurrency, orderCurrency)} {orderCurrency}</strong>
                  {balanceLak > 0 && (
                    <>
                      {' · '}
                      ຄົງເຫຼືອ: <strong className="text-fg num">
                        {orderCurrency === 'LAK'
                          ? `${formatLak(String(balanceLak))} LAK`
                          : `${formatByCurrency(currentTotalRate > 0 ? Math.round((balanceLak / currentTotalRate) * 100) / 100 : 0, orderCurrency)} ${orderCurrency}`}
                      </strong>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary" onClick={closeCreateModal}>
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary min-w-[120px]"
                disabled={!canSave || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ສ້າງ Order'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {error && (
            <div id="orders-modal-error" role="alert" className="notice status-danger">{error}</div>
          )}

          {/* ຂໍ້ມູນຫຼັກ */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="modal-phone">ເບີໂທ</label>
              <input
                id="modal-phone"
                className="input num"
                inputMode="numeric"
                maxLength={8}
                placeholder="20XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>

            <div>
              <label className="label" htmlFor="modal-billNo">ເລກບິນ (BILL ID)</label>
              <input
                id="modal-billNo"
                className="input num font-mono"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={billNo}
                onChange={(e) => setBillNo(e.target.value.replace(/\D/g, ''))}
              />
            </div>

            <div>
              <label className="label" htmlFor="modal-productType">ປະເພດສິນຄ້າ</label>
              <select
                id="modal-productType"
                className="input"
                value={productType}
                onChange={(e) => setProductType(e.target.value as 'IT' | 'ITP')}
              >
                <option value="IT">IT (ສັ່ງທົ່ວໄປ)</option>
                <option value="ITP">ITP (ສັ່ງພິເສດ)</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="modal-staffName">ພະນັກງານຮັບ</label>
              <input
                id="modal-staffName"
                className="input"
                placeholder="ຊື່ພະນັກງານ"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
              />
            </div>
          </div>

          {/* ລາຍການຄຳ */}
          <div className="border-t border-line pt-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-fg">ລາຍການຄຳ</span>
                <span className="text-xs text-muted num font-medium">
                  ({formatWeight(String(totalWeight))} g · {totalQty} ອັນ)
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary text-xs py-1"
                onClick={() => setLines((p) => [...p, emptyLine()])}
              >
                + ເພີ່ມແຖວ
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="grid gap-2 grid-cols-[2.5fr_1.2fr_0.8fr_auto] items-center"
                >
                  <select
                    className="input"
                    aria-label={`ລາຍການ ${i + 1}`}
                    value={line.goldItemId}
                    onChange={(e) => setLine(i, { goldItemId: e.target.value })}
                  >
                    <option value="">— ເລືອກລາຍການ —</option>
                    {goldItems.map((it) => (
                      <option key={it.id} value={it.id}>{it.nameLo}</option>
                    ))}
                  </select>

                  <div className="relative flex items-center">
                    <NumberInput
                      className="input num w-full pr-6"
                      decimals={4}
                      placeholder="ນ້ຳໜັກ"
                      aria-label={`ນ້ຳໜັກ ${i + 1}`}
                      value={line.weightG}
                      onValueChange={(v) => setLine(i, { weightG: v })}
                    />
                    <span className="pointer-events-none absolute right-2 text-xs text-muted">g</span>
                  </div>

                  <input
                    className="input num w-full"
                    type="number"
                    min={1}
                    placeholder="ຈຳນວນ"
                    aria-label={`ຈຳນວນ ${i + 1}`}
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                  />

                  <button
                    type="button"
                    className="btn-ghost text-danger text-xs p-2 h-10 w-10 flex items-center justify-center rounded-lg hover:bg-danger/10"
                    disabled={lines.length === 1}
                    aria-label={`ລຶບ ${i + 1}`}
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ຍອດເງິນ ແລະ ເງິນມັດຈໍາ */}
          <div className="border-t border-line pt-4 space-y-4">
            {/* ເລືອກສະກຸນເງິນຂອງ Order (ເລືອກໄດ້ 1 ສະກຸນຕໍ່ບິນ) */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-recessed/60 border border-line">
              <div>
                <span className="font-semibold text-sm text-fg">ສະກຸນເງິນຂອງ Order</span>
                <span className="text-xs text-muted block">ເລືອກ 1 ສະກຸນເງິນສຳລັບການສ້າງ Order ນີ້ (ໃຊ້ຮ່ວມກັນທັງຍອດ TOTAL ແລະ ເງິນມັດຈຳ)</span>
              </div>
              <div className="inline-flex rounded-lg border border-line p-1 bg-surface shadow-sm">
                {(['LAK', 'THB', 'USD'] as PayCurrency[]).map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    className={`px-3.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      orderCurrency === cur
                        ? 'bg-[var(--gold)] text-white shadow-sm font-bold'
                        : 'text-muted hover:text-fg'
                    }`}
                    onClick={() => changeOrderCurrency(cur)}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>

            {/* ສ່ວນຮັບເງິນມັດຈໍາ */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-sm text-fg">Receive — ເງິນມັດຈໍາ ({orderCurrency})</span>
                {depositInOrderCurrency > 0 && (
                  <span className="text-xs text-muted">
                    ລວມມັດຈໍາ: <strong className="num text-success font-medium">{formatByCurrency(depositInOrderCurrency, orderCurrency)} {orderCurrency}</strong>
                  </span>
                )}
              </div>
              <MultiPayment
                lines={payments}
                onChange={setPayments}
                direction="in"
                labelLo={`ຮັບເງິນມັດຈໍາ (${orderCurrency})`}
                fixedCurrency={orderCurrency}
                hideEquivalent
              />
            </div>

            {/* TOTAL & Note */}
            <div className="grid gap-3 sm:grid-cols-3 pt-3 border-t border-line/60">
              <div>
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="modal-total">
                    TOTAL ({orderCurrency})
                  </label>
                  {isCustomTotal && depositTotalLak > 0 && (
                    <button
                      type="button"
                      className="text-xs text-[var(--gold)] hover:underline"
                      onClick={syncWithDeposit}
                    >
                      ອີງຕາມມັດຈຳ
                    </button>
                  )}
                </div>

                <NumberInput
                  id="modal-total"
                  className="input num font-semibold w-full"
                  decimals={orderCurrency === 'LAK' ? 0 : 2}
                  placeholder="0"
                  value={totalAmount}
                  onValueChange={(val) => {
                    setIsCustomTotal(true);
                    setTotalAmount(val);
                  }}
                />

                <div className="mt-1 text-xs">
                  {!isCustomTotal ? (
                    <span className="text-muted">ຄິດໄລ່ຕາມຍອດມັດຈຳອັດຕະໂນມັດ</span>
                  ) : totalInLak < depositTotalLak ? (
                    <span className="text-danger font-medium">TOTAL ຕ້ອງບໍ່ຕ່ຳກວ່າຍອດມັດຈຳ</span>
                  ) : balanceLak > 0 ? (
                    <span className="text-muted">
                      ຄົງເຫຼືອຊຳລະຕອນຮັບ: <strong className="num text-fg font-medium">
                        {orderCurrency === 'LAK'
                          ? `${formatLak(String(balanceLak))} LAK`
                          : `${formatByCurrency(currentTotalRate > 0 ? Math.round((balanceLak / currentTotalRate) * 100) / 100 : 0, orderCurrency)} ${orderCurrency}`}
                      </strong>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="label" htmlFor="modal-note">Note</label>
                <input
                  id="modal-note"
                  className="input"
                  placeholder="ໝາຍເຫດ (ຖ້າມີ)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </Dialog>

      {/* POP-UP MODAL: ປ່ຽນສະຖານະ / Completed ພ້ອມຈ່າຍຄືນ */}
      <Dialog
        open={Boolean(advancing)}
        onClose={() => {
          setAdvancing(null);
          setSupplierId('');
          setTransitionDate(today());
          setError(null);
        }}
        title={
          advancing ? (
            <div className="flex items-center gap-2">
              <span>{advancing.code} → {STATUS[NEXT[advancing.status]!].lo}</span>
              {NEXT[advancing.status] === 'COMPLETED' && (
                <span className="text-xs font-normal text-muted">
                  (ລູກຄ້າມາຮັບເຄື່ອງ)
                </span>
              )}
            </div>
          ) : ''
        }
        size={advancing && NEXT[advancing.status] === 'COMPLETED' ? 'lg' : 'md'}
        footer={advancing && (() => {
          const nextStatus = NEXT[advancing.status]!;
          const isCompletedStep = nextStatus === 'COMPLETED';
          const refundSummary = getOrderReceiptSummary(advancing);
          const refundAmount = refundSummary.netAmount;
          const hasRefund = isCompletedStep && refundAmount > 0.0001;
          const totalRefundEntered = refundPayments.reduce((s, l) => s + (Number(l.amount.replace(/,/g, '')) || 0), 0);
          const isOverRefund = refundAmount > 0 && totalRefundEntered > refundAmount + 0.001;
          const hasRefundLines = paymentPayload(refundPayments).length > 0;
          const refundValid = !hasRefund || (legsReady(refundPayments) && !isOverRefund);

          return (
            <div className="flex w-full items-center justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setAdvancing(null);
                  setSupplierId('');
                  setTransitionDate(today());
                  setError(null);
                }}
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary min-w-[120px]"
                aria-describedby={error ? 'orders-error' : undefined}
                disabled={
                  advance.isPending ||
                  (nextStatus === 'SENT_TO_SMITH' && !supplierId) ||
                  (isCompletedStep && Number(advancing.balanceAmount) > 0) ||
                  (isCompletedStep && !transitionDate) ||
                  (isCompletedStep && hasRefund && (!refundValid || !hasRefundLines))
                }
                onClick={() => advance.mutate(advancing)}
              >
                {advance.isPending
                  ? 'ກຳລັງບັນທຶກ...'
                  : (isCompletedStep && hasRefund ? 'ຢືນຢັນ ແລະ ຈ່າຍຄືນ' : 'ຢືນຢັນ')}
              </button>
            </div>
          );
        })()}
      >
        {advancing && (() => {
          const nextStatus = NEXT[advancing.status]!;
          const isCompletedStep = nextStatus === 'COMPLETED';
          const refundSummary = getOrderReceiptSummary(advancing);
          const refundCurrency = (refundSummary.currency === 'USD' || refundSummary.currency === 'THB')
            ? (refundSummary.currency as PayCurrency)
            : 'LAK';
          const refundAmount = refundSummary.netAmount;
          const hasRefund = isCompletedStep && refundAmount > 0.0001;

          return (
            <div className="space-y-4">
              {nextStatus === 'SENT_TO_SMITH' && (
                <div>
                  <label className="label" htmlFor="supplier">Supplier</label>
                  <select
                    id="supplier"
                    className="input w-full"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">— ເລືອກ Supplier —</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.nameLo}</option>)}
                  </select>
                </div>
              )}

              {nextStatus === 'RECEIVED_FROM_SMITH' && (
                <div>
                  <label className="label" htmlFor="tdate">ວັນທີຮັບເຄື່ອງຈາກຊ່າງ</label>
                  <input
                    id="tdate"
                    type="date"
                    className="input w-full"
                    value={transitionDate}
                    onChange={(e) => setTransitionDate(e.target.value)}
                  />
                </div>
              )}

              {isCompletedStep && (
                <div className="space-y-4">
                  <div>
                    <label className="label" htmlFor="tdate">ວັນທີລູກຄ້າມາຮັບເຄື່ອງ</label>
                    <input
                      id="tdate"
                      type="date"
                      className="input w-full"
                      value={transitionDate}
                      onChange={(e) => setTransitionDate(e.target.value)}
                    />
                  </div>

                  {hasRefund && (
                    <div className="border-t border-line pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-fg">
                          ຈ່າຍເງິນຄືນ (ຮັບມາແລ້ວ{' '}
                          {refundCurrency === 'LAK'
                            ? `${formatLak(refundAmount)} LAK`
                            : `${formatByCurrency(refundAmount, refundCurrency)} ${refundCurrency}`}
                          )
                        </span>
                      </div>
                      <MultiPayment
                        lines={refundPayments}
                        onChange={setRefundPayments}
                        owedAmount={refundAmount}
                        owedCurrency={refundCurrency}
                        fixedCurrency={refundCurrency}
                        direction="out"
                        labelLo={`ຈ່າຍເງິນຄືນ (${refundCurrency})`}
                        preventOverpay
                      />
                      <p className="text-xs text-muted">
                        ເງິນອອກຈາກລີ້ນຊັກ/ບັນຊີຈິງ ແລະ ຍອດ Advance ທີ່ຖືແທນລູກຄ້າຈະຫຼຸດລົງຕາມຈຳນວນນີ້
                      </p>
                    </div>
                  )}

                  {Number(advancing.balanceAmount) > 0 && (() => {
                    let balDisplay = `${formatLak(advancing.balanceAmount)} LAK`;
                    if (refundSummary.currency !== 'LAK') {
                      const match = advancing.note?.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
                      if (match && match[2] === refundSummary.currency) {
                        const totalInCur = Number(match[1].replace(/,/g, '')) || 0;
                        const rcvdInCur = (advancing.receipts ?? [])
                          .filter((r) => !r.isRefund && r.currency === refundSummary.currency)
                          .reduce((s, r) => s + (Number(r.amount) || 0), 0);
                        const bal = Math.max(0, totalInCur - rcvdInCur);
                        balDisplay = `${formatByCurrency(bal, refundSummary.currency)} ${refundSummary.currency}`;
                      }
                    }
                    return (
                      <div className="notice status-warning mt-3">
                        ຍັງມີຍອດຄົງເຫຼືອ {balDisplay} — ຕ້ອງຊຳຣະໃຫ້ຄົບກ່ອນ.
                        ໃຊ້ປຸ່ມ &quot;ຊຳຣະເພີ່ມ&quot; ແລ້ວລະບົບຈະປິດ Order ໃຫ້ອັດຕະໂນມັດ.
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}
      </Dialog>

      {/* POP-UP MODAL: ຊຳຣະເພີ່ມ */}
      <Dialog
        open={Boolean(paying)}
        onClose={() => {
          setPaying(null);
          setError(null);
        }}
        title={
          paying ? (() => {
            const paySummary = getOrderReceiptSummary(paying);
            const payCurrency = (paySummary.currency === 'USD' || paySummary.currency === 'THB')
              ? (paySummary.currency as PayCurrency)
              : 'LAK';
            let payBal = Number(paying.balanceAmount) || 0;
            if (payCurrency !== 'LAK') {
              const match = paying.note?.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
              if (match && match[2] === payCurrency) {
                const totalInCur = Number(match[1].replace(/,/g, '')) || 0;
                const rcvdInCur = (paying.receipts ?? [])
                  .filter((r) => !r.isRefund && r.currency === payCurrency)
                  .reduce((s, r) => s + (Number(r.amount) || 0), 0);
                payBal = Math.max(0, Math.round((totalInCur - rcvdInCur) * 100) / 100);
              } else {
                const rate = rateForTotal(payCurrency);
                payBal = rate > 0 ? Math.round((payBal / rate) * 100) / 100 : payBal;
              }
            }
            return `ຊຳຣະເພີ່ມ — ${paying.code} (ຄົງເຫຼືອ ${
              payCurrency === 'LAK'
                ? `${formatLak(paying.balanceAmount)} LAK`
                : `${formatByCurrency(payBal, payCurrency)} ${payCurrency}`
            })`;
          })() : ''
        }
        size="lg"
        footer={paying && (() => {
          const paySummary = getOrderReceiptSummary(paying);
          const payCurrency = (paySummary.currency === 'USD' || paySummary.currency === 'THB')
            ? (paySummary.currency as PayCurrency)
            : 'LAK';
          let payBal = Number(paying.balanceAmount) || 0;
          if (payCurrency !== 'LAK') {
            const match = paying.note?.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
            if (match && match[2] === payCurrency) {
              const totalInCur = Number(match[1].replace(/,/g, '')) || 0;
              const rcvdInCur = (paying.receipts ?? [])
                .filter((r) => !r.isRefund && r.currency === payCurrency)
                .reduce((s, r) => s + (Number(r.amount) || 0), 0);
              payBal = Math.max(0, Math.round((totalInCur - rcvdInCur) * 100) / 100);
            } else {
              const rate = rateForTotal(payCurrency);
              payBal = rate > 0 ? Math.round((payBal / rate) * 100) / 100 : payBal;
            }
          }
          const totalPayEntered = payPayments.reduce((s, l) => s + (Number(l.amount.replace(/,/g, '')) || 0), 0);
          const isOverPay = payBal > 0 && totalPayEntered > payBal + 0.001;

          return (
            <div className="flex w-full items-center justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setPaying(null);
                  setError(null);
                }}
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary min-w-[120px]"
                aria-describedby={error ? 'orders-error' : undefined}
                disabled={!legsReady(payPayments) || pay.isPending || isOverPay}
                onClick={() => pay.mutate(paying)}
              >
                {pay.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຮັບເງິນ'}
              </button>
            </div>
          );
        })()}
      >
        {paying && (() => {
          const paySummary = getOrderReceiptSummary(paying);
          const payCurrency = (paySummary.currency === 'USD' || paySummary.currency === 'THB')
            ? (paySummary.currency as PayCurrency)
            : 'LAK';
          let payBal = Number(paying.balanceAmount) || 0;
          if (payCurrency !== 'LAK') {
            const match = paying.note?.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
            if (match && match[2] === payCurrency) {
              const totalInCur = Number(match[1].replace(/,/g, '')) || 0;
              const rcvdInCur = (paying.receipts ?? [])
                .filter((r) => !r.isRefund && r.currency === payCurrency)
                .reduce((s, r) => s + (Number(r.amount) || 0), 0);
              payBal = Math.max(0, Math.round((totalInCur - rcvdInCur) * 100) / 100);
            } else {
              const rate = rateForTotal(payCurrency);
              payBal = rate > 0 ? Math.round((payBal / rate) * 100) / 100 : payBal;
            }
          }

          return (
            <div className="space-y-4">
              <MultiPayment
                lines={payPayments}
                onChange={setPayPayments}
                owedAmount={payBal}
                owedCurrency={payCurrency}
                fixedCurrency={payCurrency}
                direction="in"
                labelLo={`ຮັບເງິນ (${payCurrency})`}
                preventOverpay
              />
            </div>
          );
        })()}
      </Dialog>

      {/* POP-UP MODAL: ຈ່າຍເງິນຄືນ */}
      <Dialog
        open={Boolean(refunding)}
        onClose={() => {
          setRefunding(null);
          setError(null);
        }}
        title={
          refunding ? (() => {
            const refundSummary = getOrderReceiptSummary(refunding);
            const refundCurrency = (refundSummary.currency === 'USD' || refundSummary.currency === 'THB')
              ? (refundSummary.currency as PayCurrency)
              : 'LAK';
            const refundAmount = refundSummary.netAmount;
            return `ຈ່າຍເງິນຄືນ — ${refunding.code} (ຮັບມາແລ້ວ ${
              refundCurrency === 'LAK'
                ? `${formatLak(refundAmount)} LAK`
                : `${formatByCurrency(refundAmount, refundCurrency)} ${refundCurrency}`
            })`;
          })() : ''
        }
        size="lg"
        footer={refunding && (() => {
          const refundSummary = getOrderReceiptSummary(refunding);
          const refundAmount = refundSummary.netAmount;
          const totalRefundEntered = refundPayments.reduce((s, l) => s + (Number(l.amount.replace(/,/g, '')) || 0), 0);
          const isOverRefund = refundAmount > 0 && totalRefundEntered > refundAmount + 0.001;

          return (
            <div className="flex w-full items-center justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setRefunding(null);
                  setError(null);
                }}
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary min-w-[120px]"
                aria-describedby={error ? 'orders-error' : undefined}
                disabled={!legsReady(refundPayments) || refund.isPending || isOverRefund}
                onClick={() => refund.mutate(refunding)}
              >
                {refund.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຈ່າຍເງິນຄືນ'}
              </button>
            </div>
          );
        })()}
      >
        {refunding && (() => {
          const refundSummary = getOrderReceiptSummary(refunding);
          const refundCurrency = (refundSummary.currency === 'USD' || refundSummary.currency === 'THB')
            ? (refundSummary.currency as PayCurrency)
            : 'LAK';
          const refundAmount = refundSummary.netAmount;

          return (
            <div className="space-y-4">
              <MultiPayment
                lines={refundPayments}
                onChange={setRefundPayments}
                owedAmount={refundAmount}
                owedCurrency={refundCurrency}
                fixedCurrency={refundCurrency}
                direction="out"
                labelLo={`ຈ່າຍເງິນຄືນ (${refundCurrency})`}
                preventOverpay
              />
              <p className="text-xs text-muted">
                ເງິນອອກຈາກລີ້ນຊັກ/ບັນຊີຈິງ ແລະ ຍອດ Advance ທີ່ຖືແທນລູກຄ້າຈະຫຼຸດລົງຕາມຈຳນວນນີ້
              </p>
            </div>
          );
        })()}
      </Dialog>

      {/* ORDERS HISTORY TABLE */}
      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການ Order</h2>
          <span className="num text-xs text-muted">{orders.length} ລາຍການ</span>
        </div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການ Order">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ Order</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ເລກບິນ</th>
                <th>ປະເພດສິນຄ້າ</th>
                <th className="text-right">ນ້ຳໜັກລວມ (g)</th>
                <th className="text-right">ຈຳນວນລວມ</th>
                <th className="text-right">ຍອດເງິນທີ່ໄດ້ຮັບ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={11}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={orders.length === 0}
                emptyText="ຍັງບໍ່ມີ Order"
                onRetry={() => history.refetch()}
              />
              {pager.pageItems.map((row) => {
                const receiptInfo = getOrderReceiptSummary(row);
                return (
                  <tr key={row.id}>
                    {/* ລາຍການ / Supplier / ຍອດລວມ ບໍ່ຢູ່ໃນຖັນທີ່ລູກຄ້າຂໍ ແຕ່ຍັງ
                        ຕ້ອງເຂົ້າເຖິງໄດ້ — ວາງໄວ້ເປັນ tooltip ຂອງລະຫັດ Order. */}
                    <td className="font-mono text-xs"
                      title={`ລາຍການ: ${row.goldItem.nameLo} · ແຫຼ່ງທີ່ມາ: ${row.supplier?.nameLo ?? '—'} · ຍອດ Order: ${formatLak(row.totalAmount)}`}>
                      {row.code}
                      {row.lines?.length > 1 && (
                        <span className="ml-1 text-muted">({row.lines.length} ລາຍການ)</span>
                      )}
                    </td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td className="font-mono text-xs">{row.billNo}</td>
                    <td>{row.productType}</td>
                    <td className="num text-right">{formatWeight(row.weightG)}</td>
                    <td className="num text-right">{row.quantity}</td>
                    {/* ຍອດເງິນທີ່ໄດ້ຮັບໃນສະກຸນເງິນນັ້ນ */}
                    <td className="num text-right text-success font-medium">
                      {receiptInfo.currency.includes(',')
                        ? receiptInfo.amountDisplay
                        : `${receiptInfo.amountDisplay} ${receiptInfo.currency}`}
                    </td>
                    <td>
                      <span className={statusClass(row.status)}>{STATUS[row.status].lo}</span>
                    </td>
                    <td className="text-muted">{row.createdBy}</td>
                    <td className="text-right">
                      <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                        {NEXT[row.status] && (
                          <button className="btn-ghost text-xs py-1 px-2"
                            aria-label={`${STATUS[NEXT[row.status]!].lo} ${row.code}`}
                            onClick={() => {
                              const isCompleted = NEXT[row.status] === 'COMPLETED';
                              const refCur = (receiptInfo.currency === 'USD' || receiptInfo.currency === 'THB')
                                ? (receiptInfo.currency as PayCurrency)
                                : 'LAK';
                              const refAmt = receiptInfo.netAmount;
                              setAdvancing(row);
                              setPaying(null);
                              setRefunding(null);
                              setShowAdd(false);
                              setSupplierId('');
                              setTransitionDate(today());
                              if (isCompleted && refAmt > 0.0001) {
                                setRefundPayments([{ method: 'CASH', currency: refCur, amount: String(refAmt) }]);
                              } else {
                                setRefundPayments(newPaymentLines(refCur));
                              }
                            }}>
                            {STATUS[NEXT[row.status]!].lo}
                          </button>
                        )}
                        {Number(row.balanceAmount) > 0 && row.status !== 'CANCELLED' && (
                          <button className="btn-ghost text-xs py-1 px-2 text-success font-medium"
                            aria-label={`ຊຳຣະເພີ່ມ ${row.code}`}
                            onClick={() => {
                              const payCur = (receiptInfo.currency === 'USD' || receiptInfo.currency === 'THB')
                                ? (receiptInfo.currency as PayCurrency)
                                : 'LAK';
                              let payBal = Number(row.balanceAmount) || 0;
                              if (payCur !== 'LAK') {
                                const match = row.note?.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
                                if (match && match[2] === payCur) {
                                  const totalInCur = Number(match[1].replace(/,/g, '')) || 0;
                                  const rcvdInCur = (row.receipts ?? [])
                                    .filter((r) => !r.isRefund && r.currency === payCur)
                                    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
                                  payBal = Math.max(0, Math.round((totalInCur - rcvdInCur) * 100) / 100);
                                } else {
                                  const rate = rateForTotal(payCur);
                                  payBal = rate > 0 ? Math.round((payBal / rate) * 100) / 100 : payBal;
                                }
                              }
                              setPaying(row); setAdvancing(null); setShowAdd(false); setRefunding(null);
                              const initPay = newPaymentLines(payCur);
                              if (payBal > 0) {
                                initPay[0].amount = String(payBal);
                              }
                              setPayPayments(initPay);
                            }}>
                            ຊຳຣະເພີ່ມ
                          </button>
                        )}
                        {/* ຈ່າຍເງິນຄືນໄດ້ ເມື່ອຍັງມີຍອດທີ່ຍັງບໍ່ທັນຄືນ ແລະ ສະຖານະເປັນ COMPLETED ແລ້ວ (ກໍລະນີຍັງບໍ່ທັນຄືນຄົບ). */}
                        {receiptInfo.netAmount > 0.0001 && row.status === 'COMPLETED' && (
                          <button className="btn-ghost text-xs py-1 px-2 text-danger font-medium"
                            aria-label={`ຈ່າຍເງິນຄືນ ${row.code}`}
                            onClick={() => {
                              const refCur = (receiptInfo.currency === 'USD' || receiptInfo.currency === 'THB')
                                ? (receiptInfo.currency as PayCurrency)
                                : 'LAK';
                              setRefunding(row); setPaying(null); setAdvancing(null);
                              setShowAdd(false);
                              const initRef = newPaymentLines(refCur);
                              if (receiptInfo.netAmount > 0.0001) {
                                initRef[0].amount = String(receiptInfo.netAmount);
                              }
                              setRefundPayments(initRef);
                            }}>
                            Payment ຈ່າຍຄືນ
                          </button>
                        )}

                        <div className="flex items-center gap-0.5 border-l border-line/60 pl-1.5 ml-1">
                          {/* View Icon Button */}
                          <button
                            type="button"
                            className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-line/40 transition-colors"
                            title="ເບິ່ງລາຍລະອຽດ"
                            aria-label={`View ${row.code}`}
                            onClick={() => setViewingOrder(row)}
                          >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>

                          {/* Edit Icon Button (Admin only) */}
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-[var(--gold)] hover:bg-[var(--gold)]/10 transition-colors"
                              title="ແກ້ໄຂ Order (Admin)"
                              aria-label={`Edit ${row.code}`}
                              onClick={() => openEditModal(row)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}

                          {/* Delete Icon Button (Admin only) */}
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-danger hover:bg-danger/10 transition-colors"
                              title="ລຶບ Order (Admin)"
                              aria-label={`Delete ${row.code}`}
                              onClick={() => setDeletingOrder(row)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          )}
                        </div>
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
          ★ ເງິນມັດຈໍາບັນທຶກເປັນ +Advance · ເມື່ອຢືນຢັນລູກຄ້າຮັບເຄື່ອງ ຈະຕັດ −Advance.
          ເມື່ອຍອດຄົງເຫຼືອ = 0 ລະບົບປ່ຽນສະຖານະເປັນ Completed ອັດຕະໂນມັດ.
        </p>
      </div>

      {/* POP-UP MODAL: ລາຍລະອຽດ Order (View Details) */}
      <Dialog
        open={Boolean(viewingOrder)}
        onClose={() => setViewingOrder(null)}
        title={`ລາຍລະອຽດ Order — ${viewingOrder?.code ?? ''}`}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="text-xs text-muted">
              ສ້າງເມື່ອ: {viewingOrder ? formatDateTime(viewingOrder.createdAt) : ''}
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setViewingOrder(null)}
            >
              ປິດ
            </button>
          </div>
        }
      >
        {viewingOrder && (
          <div className="space-y-5">
            {/* ຂໍ້ມູນຫຼັກ */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 p-4 rounded-xl bg-recessed/60 border border-line">
              <Detail labelLo="ລະຫັດ Order" value={viewingOrder.code} />
              <Detail labelLo="ເລກບິນ (BILL ID)" value={viewingOrder.billNo} />
              <Detail labelLo="ປະເພດສິນຄ້າ" value={viewingOrder.productType} />
              <Detail labelLo="ສະຖານະ" value={STATUS[viewingOrder.status].lo} highlight />
              <Detail labelLo="ເບີໂທລູກຄ້າ" value={viewingOrder.customer.phone} />
              <Detail labelLo="ພະນັກງານທີ່ຮັບ" value={viewingOrder.staffName} />
              <Detail labelLo="ຜູ້ບັນທຶກ" value={viewingOrder.createdBy} />
              <Detail labelLo="Supplier" value={viewingOrder.supplier?.nameLo ?? '—'} />
              <Detail labelLo="ລວມນ້ຳໜັກ (g)" value={`${formatWeight(viewingOrder.weightG)} g`} />
              <Detail labelLo="ລວມຈຳນວນ" value={`${viewingOrder.quantity} ອັນ`} />
              <Detail labelLo="ວັນທີສັ່ງຊ່າງ" value={formatDate(viewingOrder.sentToSmithAt)} />
              <Detail labelLo="ວັນທີຮັບຈາກຊ່າງ" value={formatDate(viewingOrder.receivedFromSmithAt)} />
              <Detail labelLo="ວັນທີລູກຄ້າມາຮັບເຄື່ອງ" value={formatDate(viewingOrder.customerPickupAt || viewingOrder.completedAt)} />
            </div>

            {/* ສະຫຼຸບຍອດເງິນ */}
            <div className="grid gap-3 sm:grid-cols-3 p-4 rounded-xl bg-recessed border border-line">
              <div>
                <span className="text-xs text-muted block mb-1">ຍອດ Order ທັງໝົດ</span>
                <strong className="text-base font-semibold text-fg num">
                  {(() => {
                    const match = viewingOrder.note?.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
                    if (match && match[2] !== 'LAK') {
                      return `${match[1]} ${match[2]}`;
                    }
                    return `${formatLak(viewingOrder.totalAmount)} LAK`;
                  })()}
                </strong>
              </div>
              <div>
                <span className="text-xs text-muted block mb-1">ຍອດເງິນທີ່ໄດ້ຮັບແລ້ວ</span>
                <strong className="text-base font-semibold text-success num">
                  {(() => {
                    const summary = getOrderReceiptSummary(viewingOrder);
                    return summary.currency !== 'LAK'
                      ? `${summary.amountDisplay} ${summary.currency}`
                      : `${formatLak(viewingOrder.receivedAmount)} LAK`;
                  })()}
                </strong>
              </div>
              <div>
                <span className="text-xs text-muted block mb-1">ຍອດຄົງເຫຼືອ</span>
                <strong className={`text-base font-semibold num ${Number(viewingOrder.balanceAmount) > 0 ? 'text-warning' : 'text-fg'}`}>
                  {(() => {
                    const summary = getOrderReceiptSummary(viewingOrder);
                    if (summary.currency !== 'LAK') {
                      const match = viewingOrder.note?.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
                      const totalInCur = match ? Number(match[1].replace(/,/g, '')) || 0 : 0;
                      const rcvdInCur = (viewingOrder.receipts ?? []).filter((r) => !r.isRefund && r.currency === summary.currency).reduce((s, r) => s + (Number(r.amount) || 0), 0);
                      const bal = Math.max(0, totalInCur - rcvdInCur);
                      return `${formatByCurrency(bal, summary.currency)} ${summary.currency}`;
                    }
                    return `${formatLak(viewingOrder.balanceAmount)} LAK`;
                  })()}
                </strong>
              </div>
            </div>

            {viewingOrder.note && (
              <div className="text-xs text-muted bg-recessed/40 p-3 rounded-lg border border-line">
                <strong className="text-fg">ໝາຍເຫດ:</strong> {viewingOrder.note}
              </div>
            )}

            {/* ລາຍການຄຳໃນບິນ */}
            <div>
              <div className="font-semibold text-sm text-fg mb-2">ລາຍການຄຳໃນບິນ ({viewingOrder.lines?.length ?? 1} ລາຍການ)</div>
              <div className="table-wrap rounded-lg border border-line">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ລາຍການ</th>
                      <th className="text-right">ນ້ຳໜັກ (g)</th>
                      <th className="text-right">ຈຳນວນ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewingOrder.lines ?? []).length === 0 && (
                      <tr>
                        <td>{viewingOrder.goldItem.nameLo}</td>
                        <td className="num text-right">{formatWeight(viewingOrder.weightG)}</td>
                        <td className="num text-right">{viewingOrder.quantity}</td>
                      </tr>
                    )}
                    {(viewingOrder.lines ?? []).map((line) => (
                      <tr key={line.id}>
                        <td>{line.goldItem.nameLo}</td>
                        <td className="num text-right">{formatWeight(line.weightG)}</td>
                        <td className="num text-right">{line.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ປະຫວັດການຮັບ / ຈ່າຍເງິນໃນບິນ */}
            <div>
              <div className="font-semibold text-sm text-fg mb-2">ປະຫວັດການຮັບ / ຈ່າຍເງິນ (Payment)</div>
              <div className="table-wrap rounded-lg border border-line">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ວັນທີ-ເວລາ</th>
                      <th>ປະເພດ</th>
                      <th>ຊ່ອງທາງ</th>
                      <th>ສະກຸນເງິນ</th>
                      <th className="text-right">ຈຳນວນ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewingOrder.receipts ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-muted py-4">ຍັງບໍ່ມີການຈ່າຍເງິນ</td>
                      </tr>
                    )}
                    {(viewingOrder.receipts ?? []).map((receipt) => (
                      <tr key={receipt.id}>
                        <td className="whitespace-nowrap">{formatDateTime(receipt.createdAt)}</td>
                        <td className={receipt.isRefund ? 'text-danger font-medium' : 'text-success font-medium'}>
                          {receipt.isRefund ? 'ຈ່າຍຄືນ (−)' : receipt.isDeposit ? 'ມັດຈຳ (+)' : 'ຮັບເງິນ (+)'}
                        </td>
                        <td className="text-muted">
                          {receipt.method === 'CASH' ? 'ເງິນສົດ' : (receipt.bankAccount?.nameLo ?? 'ທະນາຄານ')}
                        </td>
                        <td>
                          <span className="font-semibold text-xs px-2 py-0.5 rounded bg-recessed border border-line">
                            {receipt.currency}
                          </span>
                        </td>
                        <td className="num text-right font-medium">
                          {formatByCurrency(receipt.amount, receipt.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* POP-UP MODAL: ແກ້ໄຂ Order (Admin) */}
      <Dialog
        open={Boolean(editingOrder)}
        onClose={() => setEditingOrder(null)}
        title={`ແກ້ໄຂ Order — ${editingOrder?.code ?? ''}`}
        size="lg"
        dismissOnScrim={false}
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="text-xs text-muted">
              {editingOrder && (
                <>
                  ມັດຈໍາ: <strong className="text-success num font-medium">{formatByCurrency(editDepositInOrderCurrency, editOrderCurrency)} {editOrderCurrency}</strong>
                  {' · '}
                  TOTAL: <strong className="num text-fg font-medium">{formatByCurrency(numEditTotalInput, editOrderCurrency)} {editOrderCurrency}</strong>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingOrder(null)}
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary min-w-[120px]"
                disabled={!canSaveEdit || updateOrderMutation.isPending}
                onClick={() => updateOrderMutation.mutate()}
              >
                {updateOrderMutation.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
              </button>
            </div>
          </div>
        }
      >
        {editingOrder && (
          <div className="space-y-4">
            {editError && (
              <div role="alert" className="notice status-danger">{editError}</div>
            )}

            {/* ຂໍ້ມູນຫຼັກ */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label" htmlFor="edit-order-phone">ເບີໂທ</label>
                <input
                  id="edit-order-phone"
                  className="input num"
                  inputMode="numeric"
                  maxLength={8}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div>
                <label className="label" htmlFor="edit-order-billNo">ເລກບິນ (BILL ID)</label>
                <input
                  id="edit-order-billNo"
                  className="input num font-mono"
                  inputMode="numeric"
                  maxLength={6}
                  value={editBillNo}
                  onChange={(e) => setEditBillNo(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div>
                <label className="label" htmlFor="edit-order-productType">ປະເພດສິນຄ້າ</label>
                <select
                  id="edit-order-productType"
                  className="input"
                  value={editProductType}
                  onChange={(e) => setEditProductType(e.target.value as 'IT' | 'ITP')}
                >
                  <option value="IT">IT (ສັ່ງທົ່ວໄປ)</option>
                  <option value="ITP">ITP (ສັ່ງພິເສດ)</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="edit-order-staffName">ພະນັກງານຮັບ</label>
                <input
                  id="edit-order-staffName"
                  className="input"
                  value={editStaffName}
                  onChange={(e) => setEditStaffName(e.target.value)}
                />
              </div>
            </div>

            {/* ສະຖານະ ແລະ Supplier */}
            <div className="grid gap-3 sm:grid-cols-2 border-t border-line pt-3">
              <div>
                <label className="label" htmlFor="edit-order-status">ສະຖານະ</label>
                <select
                  id="edit-order-status"
                  className="input font-medium"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as OrderStatus)}
                >
                  <option value="ORDER_PLACED">Order ສຳເລັດ</option>
                  <option value="SENT_TO_SMITH">ສັ່ງຊ່າງ ສຳເລັດ</option>
                  <option value="RECEIVED_FROM_SMITH">ຮັບເຄື່ອງຈາກຊ່າງ ສຳເລັດ</option>
                  <option value="AWAITING_PICKUP">ລໍຖ້າລູກຄ້າຮັບເຄື່ອງ</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">ຍົກເລີກ</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="edit-order-supplier">Supplier / ຊ່າງ</label>
                <select
                  id="edit-order-supplier"
                  className="input"
                  value={editSupplierId}
                  onChange={(e) => setEditSupplierId(e.target.value)}
                >
                  <option value="">— ເລືອກ Supplier —</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.nameLo}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ລາຍການຄຳ */}
            <div className="border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-fg">ລາຍການຄຳ</span>
                  <span className="text-xs text-muted num font-medium">
                    ({formatWeight(String(editTotalWeight))} g · {editTotalQty} ອັນ)
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-secondary text-xs py-1"
                  onClick={() => setEditLines((p) => [...p, emptyLine()])}
                >
                  + ເພີ່ມແຖວ
                </button>
              </div>

              <div className="space-y-2">
                {editLines.map((line, i) => (
                  <div
                    key={i}
                    className="grid gap-2 grid-cols-[2.5fr_1.2fr_0.8fr_auto] items-center"
                  >
                    <select
                      className="input"
                      value={line.goldItemId}
                      onChange={(e) => setEditLine(i, { goldItemId: e.target.value })}
                    >
                      <option value="">— ເລືອກລາຍການ —</option>
                      {goldItems.map((it) => (
                        <option key={it.id} value={it.id}>{it.nameLo}</option>
                      ))}
                    </select>

                    <div className="relative flex items-center">
                      <NumberInput
                        className="input num w-full pr-6"
                        decimals={4}
                        placeholder="ນ້ຳໜັກ"
                        value={line.weightG}
                        onValueChange={(v) => setEditLine(i, { weightG: v })}
                      />
                      <span className="pointer-events-none absolute right-2 text-xs text-muted">g</span>
                    </div>

                    <input
                      className="input num w-full"
                      type="number"
                      min={1}
                      placeholder="ຈຳນວນ"
                      value={line.quantity}
                      onChange={(e) => setEditLine(i, { quantity: e.target.value })}
                    />

                    <button
                      type="button"
                      className="btn-ghost text-danger text-xs p-2 h-10 w-10 flex items-center justify-center rounded-lg hover:bg-danger/10"
                      disabled={editLines.length === 1}
                      onClick={() => setEditLines((p) => p.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ຍອດເງິນ ແລະ ເງິນມັດຈໍາ */}
            <div className="border-t border-line pt-4 space-y-4">
              {/* ເລືອກສະກຸນເງິນຂອງ Order (ເລືອກໄດ້ 1 ສະກຸນຕໍ່ບິນ) */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-recessed/60 border border-line">
                <div>
                  <span className="font-semibold text-sm text-fg">ສະກຸນເງິນຂອງ Order</span>
                  <span className="text-xs text-muted block">ເລືອກ 1 ສະກຸນເງິນ (ໃຊ້ຮ່ວມກັນທັງຍອດ TOTAL ແລະ ເງິນມັດຈຳ)</span>
                </div>
                <div className="inline-flex rounded-lg border border-line p-1 bg-surface shadow-sm">
                  {(['LAK', 'THB', 'USD'] as PayCurrency[]).map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      className={`px-3.5 py-1 text-xs font-semibold rounded-md transition-all ${
                        editOrderCurrency === cur
                          ? 'bg-[var(--gold)] text-black shadow-sm font-bold'
                          : 'text-muted hover:text-fg'
                      }`}
                      onClick={() => changeEditOrderCurrency(cur)}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              {/* ສ່ວນຮັບເງິນມັດຈໍາ */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-sm text-fg">Receive — ເງິນມັດຈໍາ ({editOrderCurrency})</span>
                  {editDepositInOrderCurrency > 0 && (
                    <span className="text-xs text-muted">
                      ລວມມັດຈໍາ: <strong className="num text-success font-medium">{formatByCurrency(editDepositInOrderCurrency, editOrderCurrency)} {editOrderCurrency}</strong>
                    </span>
                  )}
                </div>
                <MultiPayment
                  lines={editPayments}
                  onChange={setEditPayments}
                  direction="in"
                  labelLo={`ຮັບເງິນມັດຈໍາ (${editOrderCurrency})`}
                  fixedCurrency={editOrderCurrency}
                  hideEquivalent
                />
              </div>

              {/* TOTAL & Note */}
              <div className="grid gap-3 sm:grid-cols-3 pt-3 border-t border-line/60">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="label" htmlFor="edit-order-total">
                      TOTAL ({editOrderCurrency})
                    </label>
                    {isEditCustomTotal && editDepositTotalLak > 0 && (
                      <button
                        type="button"
                        className="text-xs text-[var(--gold)] hover:underline"
                        onClick={syncEditWithDeposit}
                      >
                        ອີງຕາມມັດຈຳ
                      </button>
                    )}
                  </div>

                  <NumberInput
                    id="edit-order-total"
                    className="input num font-semibold w-full"
                    decimals={editOrderCurrency === 'LAK' ? 0 : 2}
                    placeholder="0"
                    value={editTotalAmount}
                    onValueChange={(val) => {
                      setIsEditCustomTotal(true);
                      setEditTotalAmount(val);
                    }}
                  />

                  <div className="mt-1 text-xs">
                    {!isEditCustomTotal ? (
                      <span className="text-muted">ຄິດໄລ່ຕາມຍອດມັດຈຳອັດຕະໂນມັດ</span>
                    ) : editTotalInLak < editDepositTotalLak ? (
                      <span className="text-danger font-medium">TOTAL ຕ້ອງບໍ່ຕ່ຳກວ່າຍອດມັດຈຳ</span>
                    ) : editBalanceLak > 0 ? (
                      <span className="text-muted">
                        ຄົງເຫຼືອຊຳລະຕອນຮັບ: <strong className="num text-fg font-medium">
                          {editOrderCurrency === 'LAK'
                            ? `${formatLak(String(editBalanceLak))} LAK`
                            : `${formatByCurrency(currentEditTotalRate > 0 ? Math.round((editBalanceLak / currentEditTotalRate) * 100) / 100 : 0, editOrderCurrency)} ${editOrderCurrency}`}
                        </strong>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="label" htmlFor="edit-order-note">Note</label>
                  <input
                    id="edit-order-note"
                    className="input"
                    placeholder="ໝາຍເຫດ (ຖ້າມີ)"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* POP-UP MODAL: ຢືນຢັນລຶບ Order (Admin) */}
      <Dialog
        open={Boolean(deletingOrder)}
        onClose={() => setDeletingOrder(null)}
        title="ຢືນຢັນການລຶບ Order"
        size="md"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDeletingOrder(null)}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={deleteOrderMutation.isPending}
              onClick={() => deletingOrder && deleteOrderMutation.mutate(deletingOrder.id)}
            >
              {deleteOrderMutation.isPending ? 'ກຳລັງລຶບ...' : 'ຢືນຢັນລຶບ'}
            </button>
          </div>
        }
      >
        {deletingOrder && (
          <div className="space-y-3">
            <p className="text-sm">
              ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບ Order ລະຫັດ{' '}
              <strong className="text-fg font-mono">{deletingOrder.code}</strong> (ເລກບິນ{' '}
              <span className="font-mono">{deletingOrder.billNo}</span>)?
            </p>
            <div className="p-3 bg-danger/10 text-danger rounded-lg text-xs leading-relaxed">
              ⚠️ ການລຶບຈະເຊື່ອງ Order ນີ້ອອກຈາກລາຍການ ແລະ ຍົກເລີກຍອດ Advance ທີ່ກ່ຽວຂ້ອງ (ສະເພາະ Admin).
            </div>
          </div>
        )}
      </Dialog>

    </div>
  );
}

/** ຊ່ອງລາຍລະອຽດໃນແຖວ View. */
function Detail({ labelLo, value, highlight }: { labelLo: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted mb-0.5">{labelLo}</div>
      <div className={`font-medium text-sm ${highlight ? 'text-[var(--gold)] font-semibold' : 'text-fg'}`}>
        {value || '—'}
      </div>
    </div>
  );
}
