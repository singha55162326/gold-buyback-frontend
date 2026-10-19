import { test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/** Unmapped API paths seen during this worker's life, logged once each so gaps are visible. */
const seenUnmapped = new Set<string>();

const D = '2026-10-18T09:30:00.000Z';
const day = (n: number) => `2026-10-${String(18 - n).padStart(2, '0')}`;

const priceLines = [
  { tierCode: 'J1', labelLo: 'ທອງຄຳ 1 ບາດ', category: 'JEWELRY', displayWeightG: '15.00', exchangeWeightG: '15.00', sellPrice: '38500000', buybackPrice: '36200000', steps: { a: '38000000', b: '38500000', c: '36500000', d: '36200000' } },
  { tierCode: 'J2', labelLo: 'ທອງຄຳ 2 ສະລຶງ', category: 'JEWELRY', displayWeightG: '7.50', exchangeWeightG: '7.50', sellPrice: '19300000', buybackPrice: '18100000', steps: null },
  { tierCode: 'B1', labelLo: 'ຄຳແທ່ງ 10 ບາດ', category: 'BAR', displayWeightG: '150.00', exchangeWeightG: '150.00', sellPrice: '384000000', buybackPrice: '369000000', steps: null },
];
const rates = { id: 'r1', thbSellRate: '650.00', usdSellRate: '22500.00', thbBuybackRate: '640.00', usdBuybackRate: '22300.00', effectiveAt: D };
const customer = { phone: '020 5551 2345' };
const goldItem = { id: 'gi1', code: 'RING', nameLo: 'ແຫວນ' };
const goldItem2 = { id: 'gi2', code: 'CHAIN', nameLo: 'ສາຍຄໍ' };
const bank = { id: 'b1', code: 'BCEL', nameLo: 'ທະນາຄານ BCEL' };
const partner = { id: 'p1', code: 'FAC1', nameLo: 'ໂຮງງານ ສົມພອນ', direction: 'BOTH', tracksGoldApAr: true };
const CUR = ['LAK', 'THB', 'USD'] as const;

const cashRows = [1, 2, 3].map((i) => ({ id: `cr${i}`, type: i === 2 ? 'OUT' : 'IN', currency: 'LAK', amount: String(i * 1500000), refType: 'MANUAL', note: 'ທົດສອບ', createdAt: D }));
const bankRows = cashRows.map((r) => ({ ...r, bankAccount: { nameLo: bank.nameLo } }));
const apArCashHistory = [1, 2, 3].map((i) => ({ id: `ah${i}`, businessDate: day(i), refType: 'MANUAL', currency: 'LAK', amountIn: String(i * 1500000), amountOut: '0', balance: String(i * 3200000), note: 'ທົດສອບ', partner: { nameLo: partner.nameLo }, category: { nameLo: 'ຄ່າສິນຄ້າ' } }));
const goldLedger = [1, 2, 3].map((i) => ({ id: `g${i}`, businessDate: day(i), partnerLabel: partner.nameLo, typeLabel: 'ຮັບເຂົ້າ', goldInG: `${i * 15}.00`, goldOutG: '0.00', weightG: `${i * 15}.00`, priceIn: '2500000', priceOut: '0', cost: String(i * 37500000), goldType: { nameLo: 'ຄຳ 96.5%' }, side: i === 2 ? 'AR' : 'AP', partner: { nameLo: partner.nameLo } }));
const order = (i: number) => ({ id: `o${i}`, code: `OD-00${i}`, billNo: `B${100 + i}`, productType: 'IT', staffName: 'ນາງ ແສງ', weightG: '15.00', quantity: 1, totalAmount: '40000000', receivedAmount: '10000000', balanceAmount: '30000000', status: ['ORDER_PLACED', 'AWAITING_PICKUP', 'COMPLETED'][i % 3], note: null, createdAt: D, receivedFromSmithAt: null, customerPickupAt: null, customer, goldItem: { nameLo: 'ແຫວນ' }, supplier: { nameLo: partner.nameLo } });
const buyback = (i: number) => ({ id: `bb${i}`, code: `BB-00${i}`, source: 'KPV', goldPercent: '96.5', outstandingAmount: '0', updatedBy: 'admin', payments: [{ id: 'pay1', method: 'CASH', currency: 'LAK', amount: '35000000', amountLak: '35000000', changeLak: '0' }], goldItem: { nameLo: 'ສາຍຄໍ' }, goldType: { nameLo: 'ຄຳ 96.5%' }, status: i === 1 ? 'PENDING' : 'COMPLETED', weightG: '15.20', quantity: 1, payableAmount: '35000000', createdAt: D, customer });
const apArTotals = CUR.slice(0, 2).map((c) => ({ currency: c, opening: '1000000', increases: '3000000', decreases: '500000', net: '3500000' }));
const apArPartners = [{ partnerId: 'p1', partnerCode: 'FAC1', partnerNameLo: partner.nameLo, currency: 'LAK', broughtForward: '1000000', increases: '3000000', decreases: '500000', current: '3500000' }];

/**
 * Path (after `/api`, no query string) -> response body for GET.
 * Derived from the `api.get(...)` calls under src/ (grep `api.get<`); shapes copied from each page's interfaces.
 */
const GET: Record<string, unknown> = {
  '/pricing/current': { id: 'pb1', price1Baht: '36000000', effectiveAt: D, lines: priceLines },
  '/pricing/history': [1, 2, 3].map((i) => ({ id: `ph${i}`, date: day(i), price1Baht: String(36000000 - i * 100000), updatedBy: 'admin', note: null })),
  '/rates/current': rates,
  '/rates/history': [1, 2].map((i) => ({ ...rates, id: `rh${i}`, updatedBy: 'admin' })),
  '/rates/series': ['2026-07', '2026-08', '2026-09', '2026-10'].map((m, i) => ({ month: m, thbSell: String(640 + i * 3), thbBuyback: String(630 + i * 3), usdSell: String(22300 + i * 50), usdBuyback: String(22100 + i * 50) })),
  '/ledger/wac': { newWeightG: '320.50', newCost: '780000000', oldWeightG: '150.25', oldCost: '350000000', totalWeightG: '470.75', totalCost: '1130000000', pricePerG: '2400000', pricePerBaht: '36000000' },
  '/ledger/coh': {
    cash: CUR.map((c, i) => ({ currency: c, cash: '12500000', bcel: '8000000', ldb: '3000000', otherBank: '0', ap: '1000000', ar: '2000000', coh: String(24500000 / (i + 1)), advance: '1500000' })),
    gold: { newG: '320.50', oldG: '150.25', apG: '30.00', arG: '45.00', cohG: '485.75', cohBaht: '32.38' },
  },
  '/ledger/wealth': { totalLak: '45000000', totalThb: '120000', totalUsd: '3500', thbSellRate: '650', usdSellRate: '22500', price1Baht: '36000000', thbInLak: '78000000', usdInLak: '78750000', grandTotalLak: '201750000', weightG: '84.10', baht: '5.61' },
  '/finance/advance': { totals: [{ currency: 'LAK', net: '4500000' }, { currency: 'THB', net: '12000' }], billCount: 3 },
  '/finance/advance/history': [1, 2].map((i) => ({ id: `a${i}`, businessDate: day(i), currency: 'LAK', amountIn: '2000000', amountOut: '0', balance: '2000000', method: 'CASH', note: null, order: order(i), bankAccount: null })),
  '/system/readiness': {
    level: 'warn', checkedAt: D,
    checks: [
      { key: 'price', labelLo: 'ລາຄາທອງ', level: 'ok', detailLo: 'ຕັ້ງລາຄາແລ້ວ', actionLo: null, href: null },
      { key: 'wa', labelLo: 'WhatsApp', level: 'warn', detailLo: 'ຍັງບໍ່ໄດ້ຕັ້ງຜູ້ຮັບ', actionLo: 'ຕັ້ງຄ່າ', href: '/admin/notifications' },
    ],
  },
  '/shifts/me': { id: 's1', status: 'OPEN', openedAt: D },
  '/shifts/pending': [{ id: 's2', openedAt: D, closedAt: D, user: { fullName: 'ນາງ ແສງ', role: 'VALUER' }, closingBalances: [{ id: 'cb1', currency: 'LAK', amount: '5000000' }] }],
  '/notifications': [{ id: 'n1', title: 'ມີລາຍການລໍຖ້າອະນຸມັດ', body: 'Buyback BB-001', createdAt: D, readAt: null }],
  '/notifications/whatsapp/status': { enabled: true, configured: true, baseUrl: 'http://wa.mock', sessionId: 'kpv', reachable: true, live: true, sessionState: 'CONNECTED', detail: null },
  '/notifications/whatsapp/log': [
    { id: 'wl1', title: 'ແຈ້ງເຕືອນທົດສອບ', createdAt: D, whatsappStatus: 'SENT', whatsappTo: '8562055512345', whatsappSentAt: D, whatsappAttempts: 1, whatsappError: null },
    { id: 'wl2', title: 'ແຈ້ງເຕືອນລົ້ມເຫຼວ', createdAt: D, whatsappStatus: 'FAILED', whatsappTo: '8562055512345', whatsappSentAt: null, whatsappAttempts: 3, whatsappError: 'timeout' },
  ],
  '/fees/soft-gold': { id: 'sf1', value: '150000', effectiveAt: D },
  '/fees/soft-gold/history': [{ id: 'sf1', value: '150000', effectiveAt: D, updatedBy: 'admin' }],
  '/fees/buyback-deductions': [
    { id: 'd1', tierCode: 'J1', kind: 'PERCENT', value: '5', tier: { labelLo: 'ທອງຄຳ 1 ບາດ', displayWeightG: '15.00', sortOrder: 1 } },
    { id: 'd2', tierCode: 'J2', kind: 'AMOUNT', value: '200000', tier: { labelLo: 'ທອງຄຳ 2 ສະລຶງ', displayWeightG: '7.50', sortOrder: 2 } },
  ],
  '/fees/conversion/jewelry': [{ id: 'cj1', tierCode: 'J1', weightG: '15.00', feeGoodShape: '300000', feeDamagedShape: '450000', tier: { labelLo: 'ທອງຄຳ 1 ບາດ', sortOrder: 1 } }],
  '/fees/conversion/bar': [{ id: 'cb1', weightG: '150.00', barToJewelry: '500000', barToBar: '250000' }],
  '/fees/conversion/jewelry/history': [
    { id: 'cjh1', tierCode: 'J1', weightG: '15.00', feeGoodShape: '300000', feeDamagedShape: '450000', tier: { labelLo: 'ທອງຄຳ 1 ບາດ', sortOrder: 1 }, effectiveAt: D, deletedAt: null, updatedBy: 'admin' },
    { id: 'cjh2', tierCode: 'J2', weightG: '7.50', feeGoodShape: '200000', feeDamagedShape: '300000', tier: { labelLo: 'ທອງຄຳ 2 ສະລຶງ', sortOrder: 2 }, effectiveAt: D, deletedAt: D, updatedBy: 'admin' },
  ],
  '/fees/conversion/bar/history': [
    { id: 'cbh1', weightG: '150.00', barToJewelry: '500000', barToBar: '250000', effectiveAt: D, deletedAt: null, updatedBy: 'admin' },
    { id: 'cbh2', weightG: '300.00', barToJewelry: '900000', barToBar: '450000', effectiveAt: D, deletedAt: D, updatedBy: 'admin' },
  ],
  '/catalog/cabinets': [{ id: 'c1', code: 'C01', nameLo: 'ຕູ້ ໜ້າຮ້ານ' }, { id: 'c2', code: 'C02', nameLo: 'ຕູ້ ຫຼັງຮ້ານ' }],
  '/catalog/gold-types': [{ id: 'gt1', code: 'G96', nameLo: 'ຄຳ 96.5%', isStockType: true }, { id: 'gt2', code: 'G90', nameLo: 'ຄຳ 90%', isStockType: false }],
  '/catalog/gold-items': [goldItem, goldItem2],
  '/catalog/partners': [partner, { ...partner, id: 'p2', code: 'VEN1', nameLo: 'ຜູ້ສະໜອງ ວຽງຈັນ', direction: 'IN', tracksGoldApAr: false }],
  '/catalog/bank-accounts': [bank, { id: 'b2', code: 'LDB', nameLo: 'ທະນາຄານ LDB' }],
  '/skus': [
    { id: 'sk1', nameLo: 'ແຫວນ 1 ສະລຶງ', fullSkuName: 'ແຫວນ 1 ສະລຶງ', weightG: '3.75', bahtWeight: '0.25', isActive: true, goldItem },
    { id: 'sk2', nameLo: 'ສາຍຄໍ 1 ບາດ', fullSkuName: 'ສາຍຄໍ 1 ບາດ', weightG: '15.00', bahtWeight: '1.00', isActive: true, goldItem: goldItem2 },
  ],
  '/admin/users': [
    { id: 'u1', username: 'admin', fullName: 'ທົດສອບ ລະບົບ', role: 'ADMIN', phone: '020 5551 0001', whatsappNumber: null, notifyWhatsApp: false, isActive: true, lastLoginAt: D },
    { id: 'u2', username: 'valuer1', fullName: 'ນາງ ແສງ', role: 'VALUER', phone: null, whatsappNumber: '8562055512345', notifyWhatsApp: true, isActive: true, lastLoginAt: null },
  ],
  '/admin/deleted': [{ entity: 'Product', labelLo: 'ສິນຄ້າ', id: 'x1', code: 'P-001', detail: 'ສິນຄ້າທົດສອບ', deletedAt: D }],
  '/cash/balances': CUR.map((c, i) => ({ currency: c, inflow: String(5000000 / (i + 1)), outflow: String(1200000 / (i + 1)), balance: String(3800000 / (i + 1)) })),
  '/cash/history': cashRows,
  '/cash/requests': [
    { id: 'cq1', direction: 'WITHDRAW', status: 'APPROVED', note: null, createdAt: D, lines: [{ id: 'l1', currency: 'LAK', amount: '5000000' }], shift: { user: { fullName: 'ນາງ ແສງ' } } },
    { id: 'cq2', direction: 'HANDOVER', status: 'COMPLETED', note: 'ສົ່ງມອບ', createdAt: D, lines: [{ id: 'l2', currency: 'THB', amount: '20000' }], shift: { user: { fullName: 'ນາງ ແສງ' } } },
  ],
  '/cash/bank/balances': [{ bankAccountId: 'b1', bankCode: 'BCEL', bankNameLo: bank.nameLo, currency: 'LAK', inflow: '9000000', outflow: '1000000', actual: '8000000', net: '8000000', variance: '0' }],
  '/cash/bank/history': bankRows,
  '/stock/old-gold-summary': [{ goldTypeId: 'gt1', goldTypeCode: 'G96', goldTypeNameLo: 'ຄຳ 96.5%', weightG: '120.50', bahtWeight: '8.03', quantity: 12, totalPaid: '290000000', averagePerGram: '2400000', averagePerBaht: '36000000', averageMessageLo: null }],
  '/stock/handovers': [{ id: 'ho1', code: 'HO-001', weightG: '50.00', status: 'COMPLETED', note: null, createdAt: D, goldType: { nameLo: 'ຄຳ 96.5%' }, shift: { user: { fullName: 'ນາງ ແສງ' } } }],
  '/stock/new/balances': [{ id: 'nb1', openingQty: 5, inQty: 3, outQty: 2, balanceQty: 6, totalWeightG: '22.50', goldSku: { fullSkuName: 'ແຫວນ 1 ສະລຶງ', weightG: '3.75' } }],
  '/stock/new/history': goldLedger,
  '/stock/old/balances': [{ id: 'ob1', openingWeightG: '50.00', openingCost: '120000000', inG: '80.00', outG: '9.50', priceIn: '2400000', priceOut: '2400000', closingWeightG: '120.50', closingCost: '289200000', goldType: { nameLo: 'ຄຳ 96.5%' } }],
  '/stock/old/history': goldLedger,
  '/stock/factory': [{ id: 'f1', goldOutG: '30.00', factoryAssessedG: null, cost: '72000000', status: 'AWAITING_ASSESSMENT', createdAt: D, completedAt: null, partner: { nameLo: partner.nameLo }, movement: { code: 'MV-001', transformType: null } }],
  '/ledger/ap-ar/gold': [{ side: 'AP', startG: '10.00', netMovementG: '20.00', totalG: '30.00', totalBaht: '2.00' }, { side: 'AR', startG: '15.00', netMovementG: '30.00', totalG: '45.00', totalBaht: '3.00' }],
  '/ledger/ap-ar/gold/partners': ['AP', 'AR'].map((s) => ({ partnerId: 'p1', partnerCode: 'FAC1', partnerNameLo: partner.nameLo, side: s, broughtForwardG: '10.00', increasesG: '25.00', decreasesG: '5.00', currentG: '30.00' })),
  '/ledger/ap-ar/gold/history': goldLedger,
  '/ledger/ap-ar/cash': ['AP', 'AR'].flatMap((s) => ['LAK', 'THB'].map((c) => ({ side: s, currency: c, opening: '1000000', increases: '3000000', decreases: '500000', net: '3500000' }))),
  '/ledger/ap-ar/cash/history': ['AP', 'AR'].map((s, i) => ({ id: `ac${i}`, side: s, refType: 'MANUAL', businessDate: day(i), currency: 'LAK', amountIn: '2000000', amountOut: '0', balance: '2000000', note: null })),
  '/finance/ap-ar/categories': [{ id: 'k1', code: 'K1', nameLo: 'ຄ່າສິນຄ້າ' }],
  '/finance/income-expense/categories': [{ id: 'k1', code: 'IE1', nameLo: 'ຄ່າໄຟ', kind: 'EXPENSE' }, { id: 'k2', code: 'IE2', nameLo: 'ດອກເບ້ຍ', kind: 'INCOME' }],
  '/finance/income-expense': [{ id: 'ie1', code: 'IE-001', kind: 'EXPENSE', currency: 'LAK', amount: '850000', method: 'CASH', note: null, createdAt: D, category: { nameLo: 'ຄ່າໄຟ' }, bankAccount: null }],
  '/finance/consignments': {
    rows: [{ id: 'cs1', code: 'CS-001', billId: 'B201', customerName: 'ທ້າວ ບຸນມີ', staffName: 'ນາງ ແສງ', totalWeightG: '18.00', totalQuantity: 2, status: 'HELD', createdAt: D, customer, lines: [{ id: 'cl1', nameLo: 'ສາຍຄໍ', weightG: '15.00', quantity: 1 }, { id: 'cl2', nameLo: 'ແຫວນ', weightG: '3.00', quantity: 1 }] }],
    totals: { totalWeightG: '18.00', totalQuantity: 2, billCount: 1 },
  },
  '/orders': [order(1), order(2), order(3)],
  '/buyback': [buyback(1), buyback(2)],
  '/exchange': [{ id: 'ex1', code: 'EX-001', txnType: 'EXCHANGE', totalPayable: '12000000', outstandingAmount: '0', status: 'COMPLETED', createdAt: D, updatedBy: 'admin', customer, oldLines: [{ id: 'ol1', weightG: '15.00', quantity: 1 }], newLines: [{ id: 'nl1', weightG: '15.00', quantity: 1 }] }],
  '/credit': [{ id: 'cd1', code: 'CD-001', weightG: '15.00', quantity: 1, sellPrice: '38500000', downPayment: '10000000', outstanding: '28500000', status: 'APPROVED', updatedBy: 'admin', createdAt: D, customer, goldItem: { nameLo: 'ແຫວນ' } }],
};

// Side-parameterised cash AP/AR endpoints (`/finance/ap-ar/{AP|AR}/...`).
for (const side of ['AP', 'AR', 'ap', 'ar']) {
  GET[`/finance/ap-ar/${side}/totals`] = apArTotals;
  GET[`/finance/ap-ar/${side}/partners`] = apArPartners;
  GET[`/finance/ap-ar/${side}/history`] = apArCashHistory;
}
GET['/catalog/cabinets/c1'] = { cabinet: { id: 'c1', code: 'C01', nameLo: 'ຕູ້ ໜ້າຮ້ານ' }, totalWeightG: '22.50', lines: [{ id: 'cl1', weightG: '22.50', quantity: 6, goldSku: { fullSkuName: 'ແຫວນ 1 ສະລຶງ' } }] };

const LOGIN = { accessToken: 'e2e-token', user: { id: 'u1', username: 'admin', fullName: 'ທົດສອບ ລະບົບ', role: 'ADMIN' } };

function resolve(method: string, pathname: string): { body: unknown; mapped: boolean } {
  const path = pathname.replace(/^\/api/, '');
  if (method === 'GET' && path in GET) return { body: GET[path], mapped: true };
  if (method === 'POST' && path === '/auth/login') return { body: LOGIN, mapped: true };
  if (method === 'POST' && path === '/auth/logout') return { body: {}, mapped: true };
  // Fallback: GET -> [] , writes -> {} (both 200).
  return { body: method === 'GET' ? [] : {}, mapped: false };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

/**
 * Answers every request to http://api.mock/**.
 * - unmapped GET -> `[]`, unmapped write -> `{}` (both 200); each unmapped path is logged once per worker.
 * - socket.io (notification bell) is aborted quietly; the matching console noise is filtered
 *   in `isIgnorableConsoleError` below.
 */
export async function mockApi(page: Page): Promise<void> {
  const answer = async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const { body, mapped } = resolve(req.method(), url.pathname);
    if (!mapped) {
      const key = `${req.method()} ${url.pathname}`;
      // Surface gaps in the HTML report as well as the console.
      try {
        const ann = test.info().annotations;
        if (!ann.some((a) => a.type === 'unmapped-api' && a.description === key)) ann.push({ type: 'unmapped-api', description: key });
      } catch {
        /* called outside a running test */
      }
      if (!seenUnmapped.has(key)) {
        seenUnmapped.add(key);
        console.log(`[api-mock] UNMAPPED ${key}`);
      }
    }
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
  };

  // Registered FIRST: Playwright tries the most recently registered route first,
  // so the specific routes below still win. This only catches stray host paths
  // (anything on api.mock that is not /api/** or socket.io) so nothing reaches the network.
  await page.route('http://api.mock/**', answer);
  await page.routeWebSocket(/api\.mock/, (ws) => {
    void ws.close();
  });
  await page.route('http://api.mock/socket.io/**', (route) => route.abort('connectionrefused'));
  await page.route('http://api.mock/api/**', answer);
}

/**
 * Console-error filter. Ignored: the socket.io / WebSocket connection to the mock API host
 * (notification-bell opens a websocket that cannot succeed in tests, and the browser logs
 * "WebSocket connection to ... failed"). Everything else counts as a failure.
 */
export function isIgnorableConsoleError(text: string, url: string | undefined): boolean {
  if (/socket\.io|websocket/i.test(text)) return true;
  if (url && /socket\.io|\/ws\b/.test(url)) return true;
  return false;
}
