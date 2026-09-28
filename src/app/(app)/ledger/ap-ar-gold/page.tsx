import { redirect } from 'next/navigation';

/** §8 was split into two windows (§8.2 AP, §8.3 AR); land on AP. */
export default function Page() {
  redirect('/ledger/ap-gold');
}
