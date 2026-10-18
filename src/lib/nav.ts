/**
 * The navigation map — one entry per module in TOR §3 to §9.
 *
 * `roles` drives both the sidebar and the client-side route gate, so a module
 * appears exactly where the TOR says it should. `status` marks which screens
 * are wired to the API in Phase 1 versus which are laid-out shells.
 */
export type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'PAYMENT'
  | 'VALUER'
  | 'FINANCIAL_CONTROLLER'
  | 'WAREHOUSE';

export interface NavItem {
  href: string;
  labelLo: string;
  /** TOR section this screen implements. */
  section: string;
  roles: Role[];
  status: 'live' | 'shell';
}

export interface NavGroup {
  labelLo: string;
  items: NavItem[];
}

const ADMIN: Role[] = ['ADMIN', 'MANAGER'];
const ALL: Role[] = ['ADMIN', 'MANAGER', 'PAYMENT', 'VALUER', 'FINANCIAL_CONTROLLER', 'WAREHOUSE'];

export const NAV: NavGroup[] = [
  {
    labelLo: 'ພາບລວມ',
    items: [
      { href: '/dashboard', labelLo: 'Dashboard', section: '§3.7', roles: ALL, status: 'live' },
      // Everyone gets the manual: it is written per role and hides the
      // chapters that are not yours.
      { href: '/help', labelLo: 'ຄູ່ມືການໃຊ້ງານ', section: '', roles: ALL, status: 'live' },
    ],
  },
  {
    labelLo: 'ຂໍ້ມູນຫຼັກ (Admin)',
    items: [
      { href: '/admin/products', labelLo: 'ຈັດການ Products & ຕັ້ງລາຄາ', section: '§3.1', roles: ADMIN, status: 'live' },
      { href: '/admin/deductions', labelLo: 'ລາຄາລົບອອກ & ຫັກອອກ (%)', section: '§3.2', roles: ADMIN, status: 'live' },
      { href: '/admin/rates', labelLo: 'Price Rate (ອັດຕາແລກປ່ຽນ)', section: '§3.3', roles: ADMIN, status: 'live' },
      { href: '/admin/conversion-fees', labelLo: 'ຄ່າປ່ຽນ', section: '§3.4', roles: ADMIN, status: 'live' },
      { href: '/admin/soft-gold-fee', labelLo: 'ຄ່າອ່ອນ', section: '§3.4', roles: ADMIN, status: 'live' },
      { href: '/admin/gold-types', labelLo: 'ປະເພດຄຳ & ລາຍການຄຳ', section: '§3.5', roles: ADMIN, status: 'live' },
      { href: '/admin/skus', labelLo: 'ຈັດການ SKU ນ້ຳໜັກຂອງຄຳ', section: '§3.6', roles: ADMIN, status: 'live' },
      { href: '/admin/cabinets', labelLo: 'ຕູ້ເຄື່ອງ', section: '§3.7', roles: ADMIN, status: 'live' },
      { href: '/admin/banks', labelLo: 'ລາຍການ Bank', section: '§3.7', roles: ADMIN, status: 'live' },
      { href: '/admin/income-expense-categories', labelLo: 'ເພີ້ມລາຍການຮັບຈ່າຍ', section: '§3.7', roles: ADMIN, status: 'live' },
      { href: '/admin/ap-ar-categories', labelLo: 'ລາຍການ AP-AR (Cash)', section: '§9.1', roles: ADMIN, status: 'live' },
      { href: '/admin/partners', labelLo: 'Supplier — ແຫຼ່ງຮັບເຂົ້າ / ສົ່ງອອກ', section: '§3.7', roles: ADMIN, status: 'live' },
      { href: '/admin/users', labelLo: 'User Setting', section: '§3.7', roles: ADMIN, status: 'live' },
      { href: '/admin/notifications', labelLo: 'ການແຈ້ງເຕືອນ WhatsApp', section: '§10', roles: ADMIN, status: 'live' },
      { href: '/admin/deleted', labelLo: 'Deleted List', section: '§3.7', roles: ADMIN, status: 'live' },
    ],
  },
  {
    labelLo: 'ການເງິນ (Payment)',
    items: [
      { href: '/payment/wallet', labelLo: 'ກະເປົ໋າເງິນສົດ (To Day)', section: '§4.1', roles: ['PAYMENT', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/payment/bank', labelLo: 'Bank (To Day)', section: '§4.1', roles: ['PAYMENT', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/payment/approvals', labelLo: 'ລາຍການລໍຖ້າ Approve', section: '§4.2', roles: ['PAYMENT', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/payment/old-gold', labelLo: 'ຄຳເກົ່າທັງໝົດ & ສະຫຼຸບປະເພດຄຳ', section: '§4.2', roles: ['PAYMENT', 'ADMIN', 'MANAGER'], status: 'live' },
    ],
  },
  {
    labelLo: 'ຜູ້ປະເມີນລາຄາ (Valuer)',
    items: [
      { href: '/valuer/buyback', labelLo: 'Buyback (ການຊື້ຄຳຄືນ)', section: '§5.1', roles: ['VALUER', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/valuer/exchange', labelLo: 'ລາຍການປ່ຽນເປັນເງິນ', section: '§5.2', roles: ['VALUER', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/valuer/credit', labelLo: 'ລາຍການສິນເຊື່ອ', section: '§5.3', roles: ['VALUER', 'ADMIN', 'MANAGER'], status: 'live' },
    ],
  },
  {
    labelLo: 'Financial Controller',
    items: [
      { href: '/fc/approvals', labelLo: 'ອະນຸມັດ ເບີກ/ມອບ & ປິດກະ', section: '§6', roles: ['FINANCIAL_CONTROLLER', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/fc/cash', labelLo: 'Module Cash', section: '§3.7', roles: ['FINANCIAL_CONTROLLER', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/fc/bank', labelLo: 'Module Bank', section: '§3.7', roles: ['FINANCIAL_CONTROLLER', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/fc/orders', labelLo: 'ລາຍການ Order', section: '§7', roles: ['FINANCIAL_CONTROLLER', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/fc/advance', labelLo: 'Module Advace', section: '§7', roles: ['FINANCIAL_CONTROLLER', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/fc/income-expense', labelLo: 'ຈັດການລາຍຮັບລາຍຈ່າຍ', section: '§3.7', roles: ['FINANCIAL_CONTROLLER', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/fc/consignments', labelLo: 'ຝາກສິນຄ້າ', section: '§3.7', roles: ['FINANCIAL_CONTROLLER', 'PAYMENT', 'ADMIN', 'MANAGER'], status: 'live' },
    ],
  },
  {
    labelLo: 'ສາງຄຳ (Warehouse)',
    items: [
      { href: '/stock/new', labelLo: 'Stock (NEW) — ສາງຄຳໃໝ່', section: '§7.2', roles: ['WAREHOUSE', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/stock/old', labelLo: 'Stock (OLD) — ສາງຄຳເກົ່າ', section: '§7.3', roles: ['WAREHOUSE', 'ADMIN', 'MANAGER'], status: 'live' },
      { href: '/stock/factory', labelLo: 'ຕິດຕາມ Stock Out ໄປ FACTORY', section: '§7.3', roles: ['WAREHOUSE', 'ADMIN', 'MANAGER'], status: 'live' },
    ],
  },
  {
    labelLo: 'ບັນຊີ & ລາຍງານ',
    items: [
      { href: '/ledger/ap-gold', labelLo: 'AP (GOLD)', section: '§8.2', roles: ['ADMIN', 'MANAGER', 'FINANCIAL_CONTROLLER', 'WAREHOUSE'], status: 'live' },
      { href: '/ledger/ar-gold', labelLo: 'AR (GOLD)', section: '§8.3', roles: ['ADMIN', 'MANAGER', 'FINANCIAL_CONTROLLER', 'WAREHOUSE'], status: 'live' },
      { href: '/ledger/ap-cash', labelLo: 'AP (Cash)', section: '§9.4', roles: ['ADMIN', 'MANAGER', 'FINANCIAL_CONTROLLER'], status: 'live' },
      { href: '/ledger/ar-cash', labelLo: 'AR (Cash)', section: '§9.3', roles: ['ADMIN', 'MANAGER', 'FINANCIAL_CONTROLLER'], status: 'live' },
      { href: '/ledger/coh', labelLo: 'COH — Cash & Gold On Hand', section: '§3.7', roles: ['ADMIN', 'MANAGER', 'FINANCIAL_CONTROLLER'], status: 'live' },
      { href: '/ledger/wealth', labelLo: 'Wealth', section: '§3.7', roles: ADMIN, status: 'live' },
      { href: '/ledger/wac', labelLo: 'WAC ປັດຈຸບັນ', section: '§3.7', roles: ['ADMIN', 'MANAGER', 'WAREHOUSE'], status: 'live' },
      { href: '/reports', labelLo: 'Report', section: '§3.7', roles: ADMIN, status: 'live' },
    ],
  },
];

/** Sidebar groups filtered to what this role may see (TOR §2). */
export function navForRole(role: Role): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function findNavItem(href: string): NavItem | undefined {
  return NAV.flatMap((g) => g.items).find((i) => i.href === href);
}
