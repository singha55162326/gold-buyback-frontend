'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getToken } from '@/lib/api';

/**
 * ຊ່ອງທາງ real-time ອັນດຽວສຳລັບທັງແອັບ.
 *
 * ແຕ່ລະໜ້າເປີດ socket ຂອງຕົນເອງກໍ່ໄດ້ ແຕ່ຈະໄດ້ຫຼາຍການເຊື່ອມຕໍ່ຕໍ່ຜູ້ໃຊ້ໜຶ່ງຄົນ
 * ທັງທີ່ server ສົ່ງ event ດຽວກັນໃຫ້ໝົດ. ອັນນີ້ເປັນ socket ດຽວ ນັບຜູ້ຟັງໄວ້
 * ແລະ ຕັດການເຊື່ອມຕໍ່ເມື່ອຜູ້ຟັງຄົນສຸດທ້າຍອອກໄປ.
 */
let socket: Socket | null = null;
let socketToken: string | null = null;
let listeners = 0;

function acquire(): Socket | null {
  const token = getToken();
  if (!token) return null;

  // ປ່ຽນຜູ້ໃຊ້ = ປ່ຽນ token: socket ເກົ່າຢູ່ຫ້ອງຂອງຄົນເກົ່າ ຈຶ່ງຕ້ອງສ້າງໃໝ່.
  if (socket && socketToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    const url = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    socket = io(`${url}/ws`, { auth: { token }, transports: ['websocket'] });
    socketToken = token;
  }

  listeners += 1;
  return socket;
}

function release(): void {
  listeners = Math.max(0, listeners - 1);
  if (listeners === 0 && socket) {
    socket.disconnect();
    socket = null;
    socketToken = null;
  }
}

/**
 * ແລ່ນ `onEvent` ທຸກຄັ້ງທີ່ server ແຈ້ງເຕືອນ.
 *
 * ຜູ້ຮຽກບໍ່ຕ້ອງເຊື່ອ payload: event ເປັນພຽງສັນຍານວ່າ "ມີຫຍັງປ່ຽນ" ແລ້ວໜ້າຈໍ
 * ໄປຖາມ API ຄືນ. ສາຍຫຼຸດ = ຊ້າລົງ ບໍ່ແມ່ນຂໍ້ມູນຜິດ.
 */
export function useRealtime(onEvent: () => void): void {
  useEffect(() => {
    const s = acquire();
    if (!s) return;

    s.on('notification', onEvent);
    return () => {
      s.off('notification', onEvent);
      release();
    };
    // ຜູ້ຮຽກສົ່ງ callback ທີ່ຫຸ້ມດ້ວຍ `useCallback` ຫຼື ອ້າງອີງຄົງທີ່ມາ.
  }, [onEvent]);
}

/**
 * ແບບທີ່ໃຊ້ຫຼາຍທີ່ສຸດ: ມີ event ມາ → ໂຫຼດ query ເຫຼົ່ານີ້ຄືນ.
 *
 * `keys` ຕ້ອງເປັນຄ່າຄົງທີ່ນອກ component (ຫຼື `useMemo`) ບໍ່ດັ່ງນັ້ນ effect
 * ຈະຖືກສ້າງຄືນທຸກຮອບ render.
 */
export function useRealtimeInvalidate(keys: readonly string[]): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const s = acquire();
    if (!s) return;

    const handler = () => {
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    s.on('notification', handler);
    return () => {
      s.off('notification', handler);
      release();
    };
  }, [queryClient, keys]);
}
