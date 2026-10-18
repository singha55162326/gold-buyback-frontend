import { ApArCashModule } from '@/components/ap-ar-cash-module';

/** TOR §9.3 — ໜ້າຕ່າງ Module AR (Cash). */
export default function ArCashPage() {
  return (
    <ApArCashModule
      side="AR"
      titleLo="AR (Cash) — ໜີ້ຕ້ອງຮັບເງິນສົດ"
      descriptionLo="ຍອດທີ່ Supplier ຫຼື ລູກຄ້າ ຍັງຕິດໜີ້ຮ້ານ (TOR §9.3)"
    />
  );
}
