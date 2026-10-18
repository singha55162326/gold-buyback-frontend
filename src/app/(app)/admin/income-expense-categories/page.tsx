'use client';

import { SimpleCatalog } from '@/components/simple-catalog';

/** TOR §3.7 — Module ເພີ້ມລາຍການຮັບຈ່າຍ. */
export default function IncomeExpenseCategoriesPage() {
  return (
    <SimpleCatalog
      titleLo="ເພີ້ມລາຍການຮັບຈ່າຍ"
      section="§3.7"
      descriptionLo="ໝວດ ລາຍຮັບ / ລາຍຈ່າຍ ທີ່ໃຊ້ໃນ Module ຈັດການລາຍຮັບລາຍຈ່າຍ"
      listPath="/finance/income-expense/categories"
      createPath="/finance/income-expense/categories"
      queryKey={['finance', 'ie-categories', 'all']}
      addLabelLo="ເພີ່ມລາຍການ"
      fields={[
        {
          key: 'kind',
          labelLo: 'ໝວດ',
          options: [
            { value: 'INCOME', labelLo: 'ລາຍຮັບ' },
            { value: 'EXPENSE', labelLo: 'ລາຍຈ່າຍ' },
          ],
        },
        { key: 'code', labelLo: 'Code', placeholder: 'SALARY' },
        { key: 'nameLo', labelLo: 'ຊື່ລາຍການ', placeholder: 'ເງິນເດືອນ' },
      ]}
      columns={[
        { key: 'code', labelLo: 'Code' },
        { key: 'nameLo', labelLo: 'ຊື່ລາຍການ' },
        {
          key: 'kind',
          labelLo: 'ໝວດ',
          render: (row) => (row.kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'),
        },
      ]}
    />
  );
}
