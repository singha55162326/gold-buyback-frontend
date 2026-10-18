'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getStoredUser } from '@/lib/api';
import type { Role } from '@/lib/nav';

/**
 * ຄູ່ມືການໃຊ້ງານລະບົບ — in-app, because staff read this at the counter with
 * the system already open, not from a link someone emailed them.
 *
 * Organised by role rather than by module: the question someone actually has
 * is "I am the valuer, what do I do", not "what is in this module". The
 * reader's own role is pre-selected and marked, so the first thing they see is
 * their own job.
 */

type Section = {
  id: string;
  titleLo: string;
  /** Roles this chapter is written for; empty = everyone. */
  roles?: Role[];
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'ຜູ້ຈັດການ',
  PAYMENT: 'ພະນັກງານການເງິນ',
  VALUER: 'ຜູ້ປະເມີນລາຄາ',
  FINANCIAL_CONTROLLER: 'Financial Controller',
  WAREHOUSE: 'ຜູ້ຈັດການສາງ',
};

const SECTIONS: Section[] = [
  { id: 'start', titleLo: 'ເລີ່ມໃຊ້ງານ' },
  { id: 'screen', titleLo: 'ຮູ້ຈັກໜ້າຈໍ' },
  { id: 'roles', titleLo: 'ໃຜເຮັດຫຍັງ ແລະ ສາຍການອະນຸມັດ' },
  { id: 'payment', titleLo: 'ພະນັກງານການເງິນ', roles: ['PAYMENT'] },
  { id: 'valuer', titleLo: 'ຜູ້ປະເມີນລາຄາ', roles: ['VALUER'] },
  { id: 'fc', titleLo: 'Financial Controller', roles: ['FINANCIAL_CONTROLLER'] },
  { id: 'warehouse', titleLo: 'ຜູ້ຈັດການສາງ', roles: ['WAREHOUSE'] },
  { id: 'admin', titleLo: 'Admin ແລະ ຜູ້ຈັດການ', roles: ['ADMIN', 'MANAGER'] },
  { id: 'rules', titleLo: 'ກົດທີ່ຈະກັ້ນທ່ານ' },
  { id: 'daily', titleLo: 'ຮອບມື້ໜຶ່ງ' },
  { id: 'trouble', titleLo: 'ເມື່ອມີບັນຫາ' },
];

export default function HelpPage() {
  const user = getStoredUser();
  const role = user?.role;
  const [onlyMine, setOnlyMine] = useState(false);

  const visible = useMemo(() => {
    if (!onlyMine || !role) return SECTIONS;
    return SECTIONS.filter((s) => !s.roles || s.roles.includes(role));
  }, [onlyMine, role]);

  const shown = new Set(visible.map((s) => s.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ຄູ່ມືການໃຊ້ງານລະບົບ</h1>
          <p className="mt-1 text-sm text-slate-500">
            ຈັດຕາມໜ້າທີ່ — ຫາພາກຂອງທ່ານແລ້ວອ່ານສະເພາະພາກນັ້ນກໍ່ພຽງພໍ
          </p>
        </div>
        {role && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              id="onlyMine"
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
            />
            ສະແດງສະເພາະພາກຂອງຂ້ອຍ ({ROLE_LABEL[role]})
          </label>
        )}
      </div>

      {/* Contents — jumping beats scrolling in a document this long. */}
      <nav className="card p-4" aria-label="ສາລະບານ">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          ສາລະບານ
        </div>
        <ol className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s, i) => (
            <li key={s.id} className="flex items-baseline gap-2 text-sm">
              <span className="num w-5 shrink-0 text-right text-xs text-slate-400">{i + 1}</span>
              <a href={`#${s.id}`} className="text-brand-700 hover:underline">
                {s.titleLo}
              </a>
              {role && s.roles?.includes(role) && (
                <span className="badge bg-gold-100 text-gold-800">ຂອງທ່ານ</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {shown.has('start') && (
        <Chapter id="start" n={1} titleLo="ເລີ່ມໃຊ້ງານ">
          <P>
            ລະບົບເປີດຜ່ານ browser ບໍ່ຕ້ອງຕິດຕັ້ງຫຍັງ. ໃສ່ຊື່ຜູ້ໃຊ້ ແລະ ລະຫັດຜ່ານທີ່ Admin ສ້າງໃຫ້
            ແລ້ວກົດ <B>ເຂົ້າສູ່ລະບົບ</B>.
          </P>
          <P>
            ເມນູຂ້າງຊ້າຍຈະສະແດງ<B>ສະເພາະໜ້າທີ່ທ່ານມີສິດ</B>. ຖ້າເຫັນເມນູໜ້ອຍກວ່າເພື່ອນຮ່ວມງານ
            ນັ້ນເປັນເລື່ອງປົກກະຕິ.
          </P>
          <Callout tone="warn" titleLo="ຢ່າໃຊ້ບັນຊີຮ່ວມກັນ">
            ທຸກການບັນທຶກ, ແກ້ໄຂ ແລະ ອະນຸມັດ ຖືກບັນທຶກພ້ອມຊື່ຜູ້ເຮັດໃນ Audit Log.
            ຖ້າໃຊ້ບັນຊີຮ່ວມກັນຈະສືບຫາຜູ້ຮັບຜິດຊອບບໍ່ໄດ້.
          </Callout>
        </Chapter>
      )}

      {shown.has('screen') && (
        <Chapter id="screen" n={2} titleLo="ຮູ້ຈັກໜ້າຈໍ">
          <H3>ຊ່ອງຄົ້ນຫາໃນເມນູ</H3>
          <P>
            ເທິງສຸດຂອງເມນູມີຊ່ອງຄົ້ນຫາ. ພິມຊື່ເມນູ ຫຼື ພິມເລກຂໍ້ TOR ເຊັ່ນ <Code>§8</Code>
            ກໍ່ຈະພົບໜ້າທີ່ກ່ຽວຂ້ອງທັນທີ ໂດຍບໍ່ຕ້ອງໄລ່ຫາເທື່ອລະກຸ່ມ.
          </P>

          <H3>ຂໍ້ຄວາມເດັ້ງມຸມຂວາລຸ່ມ</H3>
          <P>
            ທຸກຄັ້ງທີ່ບັນທຶກ ຫຼື ອະນຸມັດ ຈະມີຂໍ້ຄວາມເດັ້ງຂຶ້ນ. <B>ສີຂຽວ</B> = ສຳເລັດ (ຫາຍເອງ 4 ວິນາທີ) ·
            <B> ສີແດງ</B> = ບໍ່ສຳເລັດ ແລະ ຢູ່ດົນກວ່າ (8 ວິນາທີ) ເພື່ອໃຫ້ອ່ານເຫດຜົນທັນ. ປັດອອກທາງຂວາໄດ້.
          </P>

          <H3>ຕາຕະລາງ</H3>
          <P>
            ຕາຕະລາງທຸກອັນມີການແບ່ງໜ້າຢູ່ລຸ່ມ ບອກວ່າ “1–25 ຈາກ 87 ລາຍການ” ແລະ ເລືອກໄດ້ວ່າຢາກເຫັນ
            10 / 25 / 50 / 100 ແຖວຕໍ່ໜ້າ. ຖັນຕົວເລກຈັດຊິດຂວາສະເໝີ ເພື່ອທຽບຕົວເລກລະຫວ່າງແຖວໄດ້ງ່າຍ.
          </P>
        </Chapter>
      )}

      {shown.has('roles') && (
        <Chapter id="roles" n={3} titleLo="ໃຜເຮັດຫຍັງ ແລະ ສາຍການອະນຸມັດ">
          <P>ວຽກສຳຄັນສ່ວນໃຫຍ່ຕ້ອງຜ່ານຢ່າງໜ້ອຍສອງຄົນ — ຄົນໜຶ່ງສ້າງ ອີກຄົນອະນຸມັດ.</P>

          <Table
            head={['ໜ້າທີ່', 'ໜ້າວຽກຫຼັກ', 'ຕ້ອງເປີດກະ']}
            rows={[
              ['Admin / ຜູ້ຈັດການ', 'ຕັ້ງລາຄາ, ອັດຕາແລກປ່ຽນ, ຂໍ້ມູນຫຼັກ, ຜູ້ໃຊ້, ອະນຸມັດ Stock OUT', 'ບໍ່ຕ້ອງ'],
              ['ພະນັກງານການເງິນ', 'ຮັບ-ຈ່າຍເງິນໜ້າຮ້ານ, ເບີກ/ມອບເງິນ, ອະນຸມັດລາຍການຜູ້ປະເມີນ', 'ຕ້ອງ'],
              ['ຜູ້ປະເມີນລາຄາ', 'ຊື້ຄຳຄືນ, ປ່ຽນເປັນເງິນ, ສິນເຊື່ອ', 'ຕ້ອງ'],
              ['Financial Controller', 'ອະນຸມັດເບີກ/ມອບເງິນ ແລະ ປິດກະ, Order, ລາຍຮັບລາຍຈ່າຍ', 'ບໍ່ຕ້ອງ'],
              ['ຜູ້ຈັດການສາງ', 'ສາງຄຳໃໝ່/ເກົ່າ, ຮັບຄຳຈາກໜ້າຮ້ານ, ຕິດຕາມ FACTORY', 'ບໍ່ຕ້ອງ'],
            ]}
          />

          <H3>ສາຍການອະນຸມັດ 4 ສາຍ</H3>
          <Chain steps={['ຜູ້ປະເມີນສ້າງລາຍການ', 'ການເງິນ Approve', 'ຜູ້ປະເມີນຢືນຢັນ', 'Completed']}
            noteLo="ໃຊ້ກັບ Buyback, ປ່ຽນເປັນເງິນ ແລະ ສິນເຊື່ອ" />
          <Chain steps={['ການເງິນຂໍເບີກ/ມອບເງິນ', 'FC Approve', 'ການເງິນຢືນຢັນຮັບເງິນ', 'ຍອດເງິນຈຶ່ງປ່ຽນ']} />
          <Chain steps={['ການເງິນມອບຄຳເກົ່າ', 'ສາງ Approve', 'ເຂົ້າ Stock (OLD)']} />
          <Chain steps={['ສາງຂໍ Stock OUT', 'Admin Approve', 'ຄຳຈຶ່ງຕັດອອກ']} />
        </Chapter>
      )}

      {shown.has('payment') && (
        <Chapter id="payment" n={4} titleLo="ພະນັກງານການເງິນ (Payment)" mine={role === 'PAYMENT'}>
          <Callout tone="stop" titleLo="ຕ້ອງກົດ “ເປີດກະ” ກ່ອນ">
            ຖ້າຍັງບໍ່ໄດ້ເປີດກະ ແຖບສີເຫຼືອງຈະຂຶ້ນວ່າ “ຍັງບໍ່ໄດ້ເປີດກະ — ບໍ່ສາມາດເຮັດທຸລະກຳໄດ້”
            ແລະ ທຸກປຸ່ມບັນທຶກຈະໃຊ້ບໍ່ໄດ້. ກົດປຸ່ມ ເປີດກະ ໃນແຖບນັ້ນເລີຍ.
          </Callout>

          <H3>ເບີກເງິນ ຫຼື ມອບເງິນ</H3>
          <Steps
            items={[
              ['ໄປໜ້າ ກະເປົ໋າເງິນສົດ (To Day) ກົດ ເບີກເງິນ (+) ຫຼື ມອບເງິນ (−).'],
              ['ໃສ່ຈຳນວນເງິນ (LAK, THB ຫຼື USD) ພ້ອມໝາຍເຫດ ແລ້ວບັນທຶກ. ສະຖານະຈະເປັນ ລໍຖ້າອະນຸມັດ.'],
              ['ລໍໃຫ້ Financial Controller ກົດ Approve.'],
              [
                'ເມື່ອໄດ້ຮັບ ຫຼື ມອບເງິນຕົວຈິງແລ້ວ ກັບມາກົດ Completed.',
                'ຍອດເງິນໃນລະບົບຈະປ່ຽນຕອນນີ້ເທົ່ານັ້ນ ບໍ່ແມ່ນຕອນ Approve — ເພື່ອບໍ່ໃຫ້ຍອດໃນລະບົບແລ່ນໜ້າເງິນຈິງ.',
              ],
            ]}
          />

          <H3>ອະນຸມັດລາຍການຈາກຜູ້ປະເມີນ</H3>
          <P>
            ເມື່ອຜູ້ປະເມີນສ້າງລາຍການ ກະດິ່ງແຈ້ງເຕືອນຈະເດັ້ງ. ໄປທີ່{' '}
            <Go href="/payment/approvals">ລາຍການລໍຖ້າ Approve</Go> ກົດ View ເບິ່ງລາຍລະອຽດ
            ແລ້ວກົດ Approve ຫຼື Reject.
          </P>

          <H3>ຄຳເກົ່າ ແລະ ການມອບໃຫ້ສາງ</H3>
          <P>
            ໜ້າ <Go href="/payment/old-gold">ຄຳເກົ່າທັງໝົດ</Go> ສະແດງຄຳເກົ່າທີ່ຮັບເຂົ້າມາໃນມື້
            ແຍກຕາມປະເພດ. ກົດ ມອບຄຳລະຫວ່າງມື້ ເພື່ອສົ່ງໃຫ້ສາງກວດຮັບ. ຕາຕະລາງສະຫຼຸບມີປຸ່ມພິມ.
          </P>

          <H3>ປິດກະ</H3>
          <P>
            ທ້າຍມື້ກົດ ປິດກະ. ຍອດເງິນສົດຄົງເຫຼືອຈະເຂົ້າ Module Cash ແລະ ຄຳເກົ່າຄົງເຫຼືອຈະເຂົ້າ
            Stock (OLD) ອັດຕະໂນມັດ ແລ້ວລໍຖ້າການອະນຸມັດ.
          </P>
          <Callout tone="warn" titleLo="ປິດກະແລ້ວເຮັດທຸລະກຳບໍ່ໄດ້ອີກ">
            ຈະເຮັດໄດ້ອີກກໍ່ຕໍ່ເມື່ອເປັນມື້ໃໝ່. ຢ່າກົດປິດກະຖ້າຍັງມີລູກຄ້າລໍຢູ່.
          </Callout>
        </Chapter>
      )}

      {shown.has('valuer') && (
        <Chapter id="valuer" n={5} titleLo="ຜູ້ປະເມີນລາຄາ (Valuer)" mine={role === 'VALUER'}>
          <Callout tone="stop" titleLo="ຕ້ອງກົດ “ເປີດກະ” ກ່ອນ">
            ຄືກັນກັບພະນັກງານການເງິນ — ບໍ່ເປີດກະ ບັນທຶກຫຍັງບໍ່ໄດ້.
          </Callout>

          <H3>ຊື້ຄຳຄືນ (Buyback)</H3>
          <Steps
            items={[
              ['ໃສ່ເບີໂທລູກຄ້າ 8 ຕົວ ກ່ອນສະເໝີ.'],
              ['ເລືອກແຫຼ່ງທີ່ມາ — ຄຳຮ້ານ KPV ຫຼື ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ).', 'ຄຳຮ້ານອື່ນຕ້ອງໃສ່ %ຄຳ ເພີ່ມ.'],
              ['ເລືອກປະເພດຄຳ ແລະ ລາຍການຄຳ ໃສ່ນ້ຳໜັກ ແລະ ຈຳນວນ. ລາຄາຄິດໄລ່ໃຫ້ອັດຕະໂນມັດ.'],
              ['ກົດປຸ່ມ Payment ເລືອກ Cash ຫຼື Bank, ເລືອກທະນາຄານ ແລະ ສະກຸນເງິນ.'],
              ['ບັນທຶກ → ລາຍການຢູ່ Pending ແລະ ສົ່ງໃຫ້ການເງິນອະນຸມັດ.'],
              ['ເມື່ອການເງິນ Approve ແລ້ວ ກັບມາກົດຢືນຢັນອີກຄັ້ງ ລາຍການຈຶ່ງເປັນ Completed.'],
            ]}
          />

          <H3>ປ່ຽນເປັນເງິນ (Exchange)</H3>
          <Callout tone="stop" titleLo="ນ້ຳໜັກຕ້ອງລົງຕົວພໍດີ 0">
            ເກນນ້ຳໜັກຄຳເກົ່າ − (ນ້ຳໜັກຄຳໃໝ່ + ຄຳເກົ່າຄົງເຫຼືອ) ຕ້ອງ = 0 ເທົ່ານັ້ນ ຈຶ່ງບັນທຶກໄດ້.
            ຖ້າບັນທຶກບໍ່ໄດ້ ລະບົບຈະບອກວ່າຍັງຂາດ ຫຼື ເກີນເທົ່າໃດ.
          </Callout>

          <H3>ສິນເຊື່ອ (Credit)</H3>
          <P>ຍອດຕິດໜີ້ = ລາຄາຂາຍ − ເງິນວາງດາວ.</P>
          <Callout tone="warn" titleLo="ເງິນທອນຕ່າງປະເທດມີເພດານ">
            ຮັບ THB ແລ້ວທອນເປັນ LAK ໄດ້ບໍ່ເກີນ 1,000 THB · ຮັບ USD ໄດ້ບໍ່ເກີນ 100 USD.
          </Callout>
        </Chapter>
      )}

      {shown.has('fc') && (
        <Chapter
          id="fc"
          n={6}
          titleLo="Financial Controller"
          mine={role === 'FINANCIAL_CONTROLLER'}
        >
          <H3>ອະນຸມັດການເບີກ/ມອບເງິນ</H3>
          <P>
            ກະດິ່ງຈະເດັ້ງເມື່ອການເງິນຂໍເບີກ, ຂໍມອບ ຫຼື ຂໍປິດກະ. ໄປໜ້າ{' '}
            <Go href="/fc/approvals">ອະນຸມັດ ເບີກ/ມອບ &amp; ປິດກະ</Go> ກວດຈຳນວນແລ້ວກົດ Approve ຫຼື Reject.
          </P>

          <H3>Order</H3>
          <Chain
            steps={[
              'Order ສຳເລັດ',
              'ສັ່ງຊ່າງ ສຳເລັດ',
              'ຮັບເຄື່ອງຈາກຊ່າງ',
              'ລໍລູກຄ້າຮັບເຄື່ອງ',
              'Completed',
            ]}
          />
          <P>
            ຂັ້ນ ສັ່ງຊ່າງ ຖາມ Supplier · ຂັ້ນ ຮັບເຄື່ອງຈາກຊ່າງ ແລະ ລູກຄ້າຮັບເຄື່ອງ ຖາມວັນທີ.
            ເມື່ອຍອດຄົງເຫຼືອເປັນ 0 ລະບົບປ່ຽນເປັນ Completed ໃຫ້ເອງ.
          </P>

          <Callout tone="info" titleLo="ເງິນມັດຈຳເຂົ້າ Advance ບໍ່ແມ່ນລາຍຮັບ">
            ຕອນ Order ສຳເລັດ ເງິນທີ່ລູກຄ້າວາງໄວ້ຈະເພີ່ມເຂົ້າ Advance (+) ເພາະຮ້ານຍັງມີພັນທະຕ້ອງສົ່ງມອບສິນຄ້າ.
            ຕອນ ຢືນຢັນລູກຄ້າຮັບເຄື່ອງ ຈຶ່ງຕັດ Advance (−). ດ້ວຍເຫດນີ້ COH ຈຶ່ງລົບ Advance ອອກ —
            ເງິນທີ່ຍັງບໍ່ແມ່ນຂອງຮ້ານຈະບໍ່ຖືກນັບເປັນຂອງຮ້ານ.
          </Callout>

          <H3>ຝາກສິນຄ້າ</H3>
          <P>
            ໃສ່ລະຫັດບິນ, ເບີໂທ 8 ຕົວ, ຊື່ລູກຄ້າ, ນ້ຳໜັກ, ຈຳນວນ ແລະ ຊື່ພະນັກງານຜູ້ຮັບ.
            ເມື່ອລູກຄ້າມາເອົາຄືນ ກົດ ຢືນຢັນການສົ່ງມອບຄືນ.
          </P>
        </Chapter>
      )}

      {shown.has('warehouse') && (
        <Chapter id="warehouse" n={7} titleLo="ຜູ້ຈັດການສາງ (Warehouse)" mine={role === 'WAREHOUSE'}>
          <Table
            head={['ປຸ່ມ', 'ໃຊ້ເມື່ອໃດ', 'ຕ້ອງອະນຸມັດບໍ່']}
            rows={[
              ['IN', 'ຮັບຄຳເຂົ້າສາງ ຈາກ EASY, FACTORY, ຊ່າງນອກ ຫຼື ອື່ນໆ', 'ບໍ່ຕ້ອງ'],
              ['OUT', 'ສົ່ງຄຳອອກ ໄປຕູ້ເຄື່ອງ, ຂາຍສົ່ງ, ຖອນ ຫຼື ສົ່ງໃຫ້ຊ່າງ', 'ຕ້ອງ — Admin/ຜູ້ຈັດການ'],
              ['Transfer', 'ຍ້າຍລະຫວ່າງສາງໃໝ່ ແລະ ສາງເກົ່າ', 'ບໍ່ຕ້ອງ'],
            ]}
          />

          <Callout tone="warn" titleLo="ຄຳສົ່ງໄປ FACTORY ຍັງບໍ່ຕັດຍອດທັນທີ">
            ລາຍການຈະໄປພັກຢູ່ໜ້າ ຕິດຕາມ Stock Out ໄປ FACTORY ກ່ອນ. ເມື່ອໂຮງງານປະເມີນນ້ຳໜັກກັບມາແລ້ວ
            ໃຫ້ໃສ່ ນ້ຳໜັກ FACTORY ປະເມີນ ແລ້ວບັນທຶກ — ສະຖານະຈຶ່ງເປັນ Completed ແລະ ລະບົບຈຶ່ງຕັດຍອດຄຳ
            ພ້ອມລົງບັນຊີ AP (GOLD) ໃຫ້. ຫຼັງ Completed ມີແຕ່ Admin ແລະ ຜູ້ຈັດການ ທີ່ແກ້ໄຂໄດ້.
          </Callout>

          <Callout tone="stop" titleLo="ສົ່ງອອກເກີນທີ່ມີບໍ່ໄດ້">
            ນ້ຳໜັກລວມທີ່ສົ່ງອອກ ຕ້ອງ ≤ ນ້ຳໜັກທີ່ມີຈິງຂອງປະເພດຄຳນັ້ນ. ຖ້າເກີນ ລະບົບຈະເຕືອນ ແລະ ບໍ່ໃຫ້ບັນທຶກ.
          </Callout>
        </Chapter>
      )}

      {shown.has('admin') && (
        <Chapter
          id="admin"
          n={8}
          titleLo="Admin ແລະ ຜູ້ຈັດການ"
          mine={role === 'ADMIN' || role === 'MANAGER'}
        >
          <P>
            ໜ້າ <Go href="/dashboard">Dashboard</Go> ມີແຜງ ຄວາມພ້ອມຂອງລະບົບ ທີ່ໄລ່ກວດໃຫ້ອັດຕະໂນມັດ
            ແລະ ມີປຸ່ມພາໄປແກ້ແຕ່ລະຂໍ້. ຖ້າທຸກຂໍ້ຂຽວ ແປວ່າພ້ອມເປີດຮ້ານ.
          </P>

          <H3>ສິ່ງທີ່ຕ້ອງຕັ້ງກ່ອນເປີດຮ້ານວັນທຳອິດ</H3>
          <Steps
            items={[
              ['ຕັ້ງລາຄາຄຳ — ໃສ່ລາຄາຂາຍ 1 ບາດ ອັນດຽວ ລະບົບຄິດໄລ່ທັງ 11 ແຖວ ພ້ອມລາຄາຊື້ຄືນໃຫ້ເອງ.'],
              ['ຕັ້ງອັດຕາແລກປ່ຽນ — ໃສ່ 4 ເລດ. ໃສ່ໄດ້ 2 ຕຳແໜ່ງທົດສະນິຍົມ ເຊັ່ນ 745.25'],
              ['ກວດຄ່າປ່ຽນ ແລະ ຄ່າອ່ອນ — ຕັ້ງມາໃຫ້ແລ້ວຕາມ TOR, ແກ້ໄດ້ຖ້າຮ້ານປ່ຽນ.'],
              ['ເພີ່ມ SKU ສິນຄ້າ — ໃສ່ຊື່ ແລະ ນ້ຳໜັກ (g) ໄດ້ 3 ຕຳແໜ່ງ. ສາຍແຂນ 15g → “ສາຍແຂນ 1 ບາດ”'],
              ['ສ້າງບັນຊີພະນັກງານ — ໃສ່ເບີ WhatsApp ໃຫ້ນຳ ບໍ່ດັ່ງນັ້ນຈະບໍ່ມີໃຜໄດ້ຮັບການແຈ້ງເຕືອນ.'],
            ]}
          />

          <Callout tone="info" titleLo="ປະຫວັດລາຄາບໍ່ຖືກລຶບ">
            ທຸກຄັ້ງທີ່ຕັ້ງລາຄາ ຫຼື ເລດໃໝ່ ລະບົບເກັບເປັນແຖວໃໝ່ ບໍ່ທັບຂອງເກົ່າ.
            ບິນເກົ່າຈຶ່ງຍັງອ້າງອີງລາຄາຂອງມື້ນັ້ນສະເໝີ.
          </Callout>

          <H3>ບັນຊີ ແລະ ລາຍງານ</H3>
          <Table
            head={['ໜ້າ', 'ບອກຫຍັງ']}
            rows={[
              ['COH', 'ເງິນ ແລະ ຄຳທີ່ຮ້ານມີຈິງ ຫຼັງຫັກໜີ້ ແລະ ເງິນມັດຈຳແລ້ວ'],
              ['Wealth', 'ມູນຄ່າລວມແປງເປັນກີບ ແລະ ທຽບເປັນນ້ຳໜັກຄຳ'],
              ['WAC', 'ຕົ້ນທຶນສະເລ່ຍຂອງຄຳທີ່ມີຢູ່ — ຕໍ່ກຣາມ ແລະ ຕໍ່ບາດ'],
              ['AP / AR (GOLD)', 'ພັນທະຄຳກັບ EASY, FACTORY, ຊ່າງນອກ'],
              ['AP / AR (Cash)', 'ໜີ້ເງິນ ເຊັ່ນ ຄ່າແຮງຊ່າງຄ້າງຈ່າຍ'],
              ['Deleted List', 'ລາຍການທີ່ຖືກລຶບ ພ້ອມຜູ້ລຶບ'],
            ]}
          />

          <H3>ການແຈ້ງເຕືອນ WhatsApp</H3>
          <P>
            ເປີດ <Go href="/admin/notifications">ການແຈ້ງເຕືອນ WhatsApp</Go> ແລ້ວເບິ່ງປ້າຍສະຖານະ.
            ປ້າຍເຫຼືອງ “ຕ້ອງສະແກນ QR” ໝາຍວ່າຕິດຕໍ່ເຄື່ອງແມ່ຂ່າຍໄດ້ແຕ່ຍັງບໍ່ໄດ້ເຊື່ອມມືຖື — ສົ່ງຂໍ້ຄວາມຍັງບໍ່ໄດ້.
            ຕ້ອງສະແກນ QR ແລະ ໃສ່ເບີພະນັກງານກ່ອນ ປ້າຍຈຶ່ງເປັນຂຽວ “ພ້ອມສົ່ງ”.
          </P>
        </Chapter>
      )}

      {shown.has('rules') && (
        <Chapter id="rules" n={9} titleLo="ກົດທີ່ຈະກັ້ນທ່ານ">
          <P>ລະບົບຈະປະຕິເສດການບັນທຶກໃນກໍລະນີລຸ່ມນີ້. ບໍ່ແມ່ນລະບົບເພ — ເປັນການກັນຄວາມຜິດພາດ.</P>
          <Table
            head={['ເມື່ອໃດ', 'ເປັນຫຍັງ', 'ແກ້ແນວໃດ']}
            rows={[
              ['ປຸ່ມບັນທຶກກົດບໍ່ໄດ້ທັງໜ້າ', 'ຍັງບໍ່ໄດ້ເປີດກະ', 'ກົດ ເປີດກະ ໃນແຖບເຫຼືອງເທິງສຸດ'],
              ['ປ່ຽນເປັນເງິນບັນທຶກບໍ່ໄດ້', 'ນ້ຳໜັກຍັງບໍ່ລົງຕົວ 0', 'ປັບນ້ຳໜັກຄຳໃໝ່ ຫຼື ຄຳເກົ່າຄົງເຫຼືອ'],
              ['Stock OUT ເຕືອນສີແດງ', 'ສົ່ງອອກເກີນນ້ຳໜັກທີ່ມີ', 'ຫຼຸດນ້ຳໜັກ ຫຼື ກວດຍອດຄົງເຫຼືອຄືນ'],
              ['ເງິນທອນ THB / USD ບັນທຶກບໍ່ໄດ້', 'ເກີນ 1,000 THB ຫຼື 100 USD', 'ຮັບເປັນກີບ ຫຼື ຫຼຸດຈຳນວນລົງ'],
              ['ເບີໂທໃສ່ບໍ່ໄດ້', 'ຕ້ອງເປັນຕົວເລກ 8 ຕົວພໍດີ', 'ໃສ່ 8 ຕົວ ບໍ່ຕ້ອງມີຂີດ ຫຼື ວັກ'],
              ['ຍອດເງິນບໍ່ປ່ຽນຫຼັງ Approve', 'ຍັງບໍ່ໄດ້ກົດ Completed', 'ການເງິນກົດ Completed ຫຼັງຮັບເງິນຈິງ'],
              ['ຍອດຄຳບໍ່ຫຼຸດຫຼັງສົ່ງ FACTORY', 'ລໍໂຮງງານປະເມີນນ້ຳໜັກ', 'ໃສ່ນ້ຳໜັກທີ່ປະເມີນ ໃນໜ້າຕິດຕາມ FACTORY'],
            ]}
          />
        </Chapter>
      )}

      {shown.has('daily') && (
        <Chapter id="daily" n={10} titleLo="ຮອບມື້ໜຶ່ງ">
          <H3>ເຊົ້າ</H3>
          <Steps
            items={[
              ['Admin ກວດລາຄາຄຳ ແລະ ອັດຕາແລກປ່ຽນຂອງມື້ — ຖ້າຕະຫຼາດປ່ຽນ ໃຫ້ຕັ້ງໃໝ່.'],
              ['ການເງິນ ແລະ ຜູ້ປະເມີນ ກົດ ເປີດກະ.'],
              ['ສາງ ກວດວ່າ Balance ມື້ວານກາຍມາເປັນຈຳນວນຕັ້ງຕົ້ນຂອງມື້ນີ້ຖືກຕ້ອງ.'],
            ]}
          />
          <H3>ແລງ</H3>
          <Steps
            items={[
              ['ການເງິນ ນັບເງິນສົດ ແລະ ຄຳເກົ່າ ແລ້ວກົດ ປິດກະ.'],
              ['FC ອະນຸມັດການປິດກະ · ສາງ ຮັບຄຳເກົ່າເຂົ້າ Stock (OLD).'],
              ['Admin ໃສ່ ຍອດ Bank ສຸດທິ ຂອງແຕ່ລະທະນາຄານ ເພື່ອໃຫ້ລະບົບຄິດໄລ່ຍອດຂາດດຸນ.'],
              ['ເບິ່ງ COH ແລະ Wealth ປິດມື້.'],
            ]}
          />
          <Callout tone="info" titleLo="ມື້ໃໝ່ຍົກຍອດໃຫ້ເອງ">
            ຍອດຄົງເຫຼືອທ້າຍມື້ຂອງ Stock, AP ແລະ AR ຈະກາຍເປັນຈຳນວນຕັ້ງຕົ້ນຂອງມື້ຕໍ່ໄປອັດຕະໂນມັດ.
            ບໍ່ຕ້ອງໃສ່ມືເອງ.
          </Callout>
        </Chapter>
      )}

      {shown.has('trouble') && (
        <Chapter id="trouble" n={11} titleLo="ເມື່ອມີບັນຫາ">
          <Table
            head={['ອາການ', 'ເຮັດແນວໃດ']}
            rows={[
              ['ຕົວເລກບໍ່ອັບເດດ', 'ກົດ refresh (F5) ກ່ອນ. ລະບົບດຶງຂໍ້ມູນໃໝ່ທຸກ 30 ວິນາທີ'],
              ['ເຂົ້າລະບົບແລ້ວເດັ້ງອອກ', 'Session ໝົດອາຍຸ — ເຂົ້າສູ່ລະບົບໃໝ່'],
              ['ເມນູທີ່ຕ້ອງການບໍ່ມີ', 'ໜ້າທີ່ຂອງທ່ານບໍ່ມີສິດເຫັນ — ຕິດຕໍ່ Admin'],
              ['WhatsApp ບໍ່ສົ່ງ', 'ເບິ່ງປ້າຍສະຖານະ ແລະ ກວດວ່າພະນັກງານມີເບີໃສ່ໄວ້ບໍ່'],
              ['ບັນທຶກຜິດໄປແລ້ວ', 'ຢ່າລຶບເອງ. ແຈ້ງ Admin — ທຸກການແກ້ໄຂມີບັນທຶກໃນ Audit Log'],
            ]}
          />
          <Callout tone="warn" titleLo="ກ່ອນໂທຫາຜູ້ດູແລ">
            ຈົດໄວ້ວ່າ: ທ່ານຢູ່ໜ້າໃດ, ກົດປຸ່ມຫຍັງ, ແລະ ຂໍ້ຄວາມສີແດງທີ່ເດັ້ງຂຶ້ນຂຽນວ່າແນວໃດ.
            ສາມຢ່າງນີ້ມັກພຽງພໍທີ່ຈະຫາສາເຫດໄດ້ທັນທີ.
          </Callout>
        </Chapter>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Building blocks — kept local: they exist to set this document's
 * rhythm, and are not general enough to belong in components/.
 * ------------------------------------------------------------------ */

function Chapter({
  id,
  n,
  titleLo,
  mine,
  children,
}: {
  id: string;
  n: number;
  titleLo: string;
  mine?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-700">
          {n}
        </span>
        <h2 className="text-lg font-semibold text-slate-900">{titleLo}</h2>
        {mine && <span className="badge bg-gold-100 text-gold-800">ພາກຂອງທ່ານ</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 text-sm font-semibold text-slate-900">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-[68ch] text-sm text-slate-700">{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-xs">
      {children}
    </code>
  );
}

/** A link that also reads as one — the manual points at real screens. */
function Go({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-brand-700 underline underline-offset-2">
      {children}
    </Link>
  );
}

function Steps({ items }: { items: [string] | [string, string][] | string[][] }) {
  return (
    <ol className="mt-3 space-y-2">
      {(items as string[][]).map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[11px] font-semibold text-slate-600">
            {i + 1}
          </span>
          <span className="max-w-[64ch] text-sm text-slate-700">
            {item[0]}
            {item[1] && <span className="mt-0.5 block text-xs text-slate-500">{item[1]}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Chain({ steps, noteLo }: { steps: string[]; noteLo?: string }) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                i === steps.length - 1
                  ? 'border-transparent bg-emerald-100 font-semibold text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {s}
            </span>
            {i < steps.length - 1 && <span className="text-slate-400">→</span>}
          </span>
        ))}
      </div>
      {noteLo && <p className="mt-1 text-xs text-slate-500">{noteLo}</p>}
    </div>
  );
}

const TONE = {
  stop: 'border-red-200 bg-red-50 text-red-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-gold-200 bg-gold-50 text-slate-800',
} as const;

function Callout({
  tone,
  titleLo,
  children,
}: {
  tone: keyof typeof TONE;
  titleLo: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mt-3 rounded-lg border px-4 py-3 text-sm ${TONE[tone]}`}>
      <div className="font-semibold">{titleLo}</div>
      <div className="mt-0.5 max-w-[66ch] opacity-90">{children}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap mt-3">
      <table className="table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={j === 0 ? 'font-medium text-slate-900' : 'text-slate-700'}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
