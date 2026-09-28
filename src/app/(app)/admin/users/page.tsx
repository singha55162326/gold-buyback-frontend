'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Role } from '@/lib/nav';

interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  phone: string | null;
  whatsappNumber: string | null;
  notifyWhatsApp: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'ຜູ້ຈັດການ',
  PAYMENT: 'ພະນັກງານການເງິນ',
  VALUER: 'ຜູ້ປະເມີນລາຄາ',
  FINANCIAL_CONTROLLER: 'Financial Controller',
  WAREHOUSE: 'ຜູ້ຈັດການສາງ',
};

const ROLES = Object.keys(ROLE_LABEL) as Role[];

/** TOR §3.7 / §2 — User Setting. */
export default function UsersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('PAYMENT');
  const [newPassword, setNewPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<User[]>('/admin/users'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/users', {
        username, fullName, role, password: newPassword,
        phone: phone || undefined,
        whatsappNumber: whatsappNumber || undefined,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setShowAdd(false); setUsername(''); setFullName(''); setNewPassword('');
      setPhone(''); setWhatsappNumber('');
      setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const update = useMutation({
    mutationFn: (input: { id: string; patch: Partial<User> }) =>
      api.patch(`/admin/users/${input.id}`, input.patch),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ອັບເດດບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const reset = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/password`, { password }),
    onSuccess: () => { setResetting(null); setPassword(''); setError(null); },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ປ່ຽນລະຫັດຜ່ານບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pager = usePagination(users);


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Setting</h1>
          <p className="mt-1 text-sm text-slate-500">
            ຈັດການຜູ້ໃຊ້ງານ ແລະ ສິດການເຂົ້າເຖິງຕາມ Role (TOR §2, §3.7)
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
          ເພີ່ມຜູ້ໃຊ້
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showAdd && (
        <div className="card p-5">
          <h2 className="card-title mb-4">ເພີ່ມຜູ້ໃຊ້ໃໝ່</h2>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className="label" htmlFor="username">ຊື່ຜູ້ໃຊ້</label>
              <input id="username" className="input" value={username}
                onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="fullName">ຊື່ ແລະ ນາມສະກຸນ</label>
              <input id="fullName" className="input" value={fullName}
                onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="role">Role</label>
              <select id="role" className="input" value={role}
                onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="newPassword">ລະຫັດຜ່ານ (8+ ໂຕ)</label>
              <input id="newPassword" type="password" className="input" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <label className="label" htmlFor="phone">ເບີໂທ</label>
              <input id="phone" className="input num" value={phone}
                onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="whatsappNumber">ເບີ WhatsApp</label>
              <input id="whatsappNumber" className="input num" placeholder="ຫວ່າງ = ໃຊ້ເບີໂທ"
                value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary"
              disabled={!username || !fullName || newPassword.length < 8 || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
            </button>
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍຊື່ຜູ້ໃຊ້ງານ</h2>
          <span className="text-xs text-slate-500">{users.length} ຄົນ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ຊື່ຜູ້ໃຊ້</th>
                <th>ຊື່ ແລະ ນາມສະກຸນ</th>
                <th>ສິດຜູ້ໃຊ້</th>
                <th>ເບີໂທ</th>
                <th>WhatsApp</th>
                <th>ສະຖານະ</th>
                <th>ເຂົ້າລະບົບລ່າສຸດ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((user) => (
                <tr key={user.id}>
                  <td className="font-mono text-xs">{user.username}</td>
                  <td className="font-medium">{user.fullName}</td>
                  <td>
                    <select
                      className="input w-44 py-1 text-xs"
                      value={user.role}
                      onChange={(e) =>
                        update.mutate({ id: user.id, patch: { role: e.target.value as Role } })
                      }
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="num">{user.phone ?? '—'}</td>
                  <td>
                    {/* TOR §10 — opt-in. Off by default: staff are never
                        messaged without being added deliberately. */}
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={user.notifyWhatsApp}
                        onChange={(e) =>
                          update.mutate({
                            id: user.id,
                            patch: { notifyWhatsApp: e.target.checked },
                          })
                        }
                      />
                      <span className="num">{user.whatsappNumber ?? user.phone ?? 'ບໍ່ມີເບີ'}</span>
                    </label>
                  </td>
                  <td>
                    <span className={user.isActive ? 'badge bg-emerald-100 text-emerald-800' : 'badge bg-slate-100 text-slate-600'}>
                      {user.isActive ? 'ໃຊ້ງານຢູ່' : 'ປິດການນຳໃຊ້'}
                    </span>
                  </td>
                  <td className="text-slate-500">{formatDateTime(user.lastLoginAt)}</td>
                  <td className="text-right">
                    {resetting === user.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <input type="password" className="input w-36 py-1 text-xs"
                          placeholder="ລະຫັດຜ່ານໃໝ່" value={password}
                          onChange={(e) => setPassword(e.target.value)} autoFocus />
                        <button className="text-sm text-gold-700 hover:underline"
                          onClick={() => reset.mutate(user.id)}
                          disabled={password.length < 8 || reset.isPending}>
                          ບັນທຶກ
                        </button>
                        <button className="text-sm text-slate-500 hover:underline"
                          onClick={() => setResetting(null)}>
                          ຍົກເລີກ
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-3">
                        <button className="text-sm text-gold-700 hover:underline"
                          onClick={() => { setResetting(user.id); setPassword(''); }}>
                          ປ່ຽນລະຫັດຜ່ານ
                        </button>
                        <button
                          className={user.isActive ? 'text-sm text-red-600 hover:underline' : 'text-sm text-emerald-700 hover:underline'}
                          onClick={() =>
                            update.mutate({ id: user.id, patch: { isActive: !user.isActive } })
                          }
                        >
                          {user.isActive ? 'ປິດການນຳໃຊ້' : 'ເປີດໃຊ້ງານ'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          ການປ່ຽນລະຫັດຜ່ານຈະຍົກເລີກ session ທັງໝົດຂອງຜູ້ໃຊ້ນັ້ນທັນທີ.
          Admin ຄົນສຸດທ້າຍບໍ່ສາມາດຖືກປິດການນຳໃຊ້ໄດ້.
          ຕິກ WhatsApp ເພື່ອໃຫ້ຜູ້ໃຊ້ນັ້ນໄດ້ຮັບການແຈ້ງເຕືອນທາງ WhatsApp ນຳ.
        </p>
      </div>
    </div>
  );
}
