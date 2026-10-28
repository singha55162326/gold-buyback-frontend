'use client';

import { SimpleCatalog } from '@/components/simple-catalog';

/** TOR §3.7 — Module ລາຍການ Bank. */
export default function BanksPage() {
  return (
    <SimpleCatalog
      titleLo="ລາຍການ Bank"
      section="§3.7"
      descriptionLo="ເພີ້ມຊື່ທະນາຄານ — ໃຊ້ໃນ Module Bank, Buyback, ປ່ຽນເປັນເງິນ, ສິນເຊື່ອ ແລະ Order"
      listPath="/catalog/bank-accounts?withActor=true"
      createPath="/finance/banks"
      queryKey={['catalog', 'bank-accounts', 'admin']}
      addLabelLo="ເພີ່ມທະນາຄານ"
      fields={[{ key: 'nameLo', labelLo: 'ຊື່ທະນາຄານ', placeholder: 'BCEL' }]}
      showRecorder
      columns={[
        { key: 'code', labelLo: 'Code' },
        { key: 'nameLo', labelLo: 'ຊື່ທະນາຄານ' },
      ]}
    />
  );
}
