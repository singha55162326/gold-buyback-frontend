/**
 * ກົດການກວດຂອງຟອມ — ສະທ້ອນກົດດຽວກັນກັບ `IsDecimalString` ຢູ່ server.
 *
 * ຟອມກວດເພື່ອ **ປະສົບການໃຊ້ງານ** (ປຸ່ມບັນທຶກຈືດ ແທນທີ່ຈະສົ່ງໄປແລ້ວເດັ້ງ error),
 * ສ່ວນການປ້ອງກັນຈິງຢູ່ server ສະເໝີ. ເກັບໄວ້ບ່ອນດຽວ ເພື່ອບໍ່ໃຫ້ແຕ່ລະໜ້າ
 * ຂຽນກົດຂອງຕົນເອງແລ້ວເພື້ອນກັນ.
 */

/** ລຶບຈຸດຫຼັກພັນ ແລະ ຊ່ອງຫວ່າງ ທີ່ NumberInput ໃສ່ໃຫ້ອ່ານງ່າຍ. */
export const clean = (value: string): string => value.replace(/,/g, '').trim();

/** ຕົວເລກບວກ ຫຼື ສູນ — ສູງສຸດ 15 ຫຼັກ ແລະ 4 ທົດສະນິຍົມ ຕາມ DECIMAL(18,4). */
export const isDecimal = (value: string): boolean => /^\d{1,15}(\.\d{1,4})?$/.test(clean(value));

/** ຕົວເລກທີ່ຕ້ອງຫຼາຍກວ່າ 0 — ເງິນ, ນ້ຳໜັກ, ລາຄາ. */
export const isPositive = (value: string): boolean =>
  isDecimal(value) && Number(clean(value)) > 0;

/** ເປີເຊັນ 0–100. */
export const isPercent = (value: string): boolean =>
  isDecimal(value) && Number(clean(value)) <= 100;

/** ເບີໂທລູກຄ້າ / ພະນັກງານ — ຕົວເລກ 8 ໂຕ. */
export const isPhone = (value: string): boolean => /^\d{8}$/.test(value.trim());

/** ເບີໂທທີ່ບໍ່ບັງຄັບ — ຫວ່າງກໍໄດ້, ໃສ່ແລ້ວຕ້ອງຄົບ 8 ໂຕ. */
export const isPhoneOrBlank = (value: string): boolean =>
  value.trim() === '' || isPhone(value);

/** ລະຫັດບິນ — ຕົວເລກ 6 ໂຕ. */
export const isBillId = (value: string): boolean => /^\d{6}$/.test(value.trim());
