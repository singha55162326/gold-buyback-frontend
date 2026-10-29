'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * ຕົວຢ່າງໃບພິມ — ເຕັມຈໍ, ກົດພິມແລ້ວອອກມາເປັນ A4 ແນວນອນ.
 *
 * ເປັນ overlay ບໍ່ແມ່ນ <Dialog> ເພາະຕອນພິມ ມັນຕ້ອງເປັນ *ເນື້ອຫາດຽວ* ຂອງໜ້າ:
 * ເປີດຢູ່ເມື່ອໃດ ຈະຕິດ `printing-sheet` ໃສ່ <html> ແລ້ວ CSS ຈະເຊື່ອງເປືອກ
 * ຂອງແອັບທັງໝົດຕອນພິມ. ຂະໜາດເຈ້ຍໃສ່ເປັນ <style> ຊົ່ວຄາວ ເພາະ `@page`
 * ບັງຄັບດ້ວຍ class ບໍ່ໄດ້.
 */
export function PrintSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;
    root.classList.add('printing-sheet');
    const page = document.createElement('style');
    page.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(page);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      root.classList.remove('printing-sheet');
      page.remove();
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label="ຕົວຢ່າງໃບພິມ">
      <div className="sheet-bar no-print">
        <b>ຕົວຢ່າງໃບພິມ · A4 ແນວນອນ</b>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            ພິມ
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} autoFocus>
            ປິດ
          </button>
        </div>
      </div>
      <div className="sheet-scroll">
        <div className="sheet">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
