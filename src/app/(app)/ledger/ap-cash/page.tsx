import { ApArCashModule } from '@/components/ap-ar-cash-module';

/** TOR §9.4 — ໜ້າຕ່າງ Module AP (Cash). */
export default function ApCashPage() {
  return (
    <ApArCashModule
      side="AP"
      titleLo="AP (Cash) — ໜີ້ຕ້ອງສົ່ງເງິນສົດ"
      descriptionLo="ຄ່າແຮງຊ່າງ FACTORY / EASY / ຊ່າງນອກ / ອື່ນໆ ຕິດໜີ້ຄ້າງຈ່າຍ (TOR §9.4)"
    />
  );
}
