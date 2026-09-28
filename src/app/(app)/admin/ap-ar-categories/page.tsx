'use client';

import { SimpleCatalog } from '@/components/simple-catalog';

/** TOR §9.1 — Module ລາຍການ AP-AR (Cash). */
export default function ApArCategoriesPage() {
  return (
    <SimpleCatalog
      titleLo="ລາຍການ AP-AR (Cash)"
      section="§9.1"
      descriptionLo="ປະເພດລາຍການທີ່ໃຊ້ຕອນເພີ່ມ AP (Cash) ແລະ AR (Cash)"
      listPath="/finance/ap-ar/categories"
      createPath="/finance/ap-ar/categories"
      queryKey={['finance', 'ap-ar-categories', 'all']}
      addLabelLo="ເພີ່ມປະເພດລາຍການ"
      fields={[
        { key: 'code', labelLo: 'Code', placeholder: 'LABOR_FEE' },
        { key: 'nameLo', labelLo: 'ຊື່ປະເພດລາຍການ', placeholder: 'ຄ່າແຮງຊ່າງ' },
        {
          key: 'side',
          labelLo: 'ດ້ານ',
          optional: true,
          options: [
            { value: 'AP', labelLo: 'AP ເທົ່ານັ້ນ' },
            { value: 'AR', labelLo: 'AR ເທົ່ານັ້ນ' },
          ],
        },
      ]}
      columns={[
        { key: 'code', labelLo: 'Code' },
        { key: 'nameLo', labelLo: 'ຊື່ປະເພດລາຍການ' },
        { key: 'side', labelLo: 'ດ້ານ', render: (row) => (row.side ? String(row.side) : 'ທັງສອງ') },
      ]}
    />
  );
}
