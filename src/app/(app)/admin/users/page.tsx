'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { TableStateRow } from '@/components/query-state';
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

  const { data: users = [], isError: usersFailed, error: usersError, refetch: refetchUsers } = useQuery({
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
      <PageHead
        title="User Setting"
        subtitle="ຈັດການຜູ້ໃຊ້ງານ ແລະ ສິດການເຂົ້າເຖິງຕາມ Role (TOR §2, §3.7)"
        actions={
          <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
            ເພີ່ມຜູ້ໃຊ້
          </button>
        }
      />

      {error && (
        <div id="users-error" role="alert" className="notice status-danger">
          {error}
        </div>
      )}

      {showAdd && (
        <div data-fade className="card p-5">
          <h2 className="card-title mb-4">ເພີ່ມຜູ້ໃຊ້ໃໝ່</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div>
              <label className="label" htmlFor="username">ຊື່ຜູ້ໃຊ້</label>
              <input id="username" aria-describedby={error ? 'users-error' : undefined} className="input" value={username}
                onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="fullName">ຊື່ ແລະ ນາມສະກຸນ</label>
              <input id="fullName" aria-describedby={error ? 'users-error' : undefined} className="input" value={fullName}
                onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="role">Role</label>
              <select id="role" aria-describedby={error ? 'users-error' : undefined} className="input" value={role}
                onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="newPassword">ລະຫັດຜ່ານ (8+ ໂຕ)</label>
              <input id="newPassword" aria-describedby={error ? 'users-error' : undefined} type="password" className="input" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <label className="label" htmlFor="phone">ເບີໂທ</label>
              <input id="phone" aria-describedby={error ? 'users-error' : undefined} className="input num" value={phone}
                onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="whatsappNumber">ເບີ WhatsApp</label>
              <input id="whatsappNumber" aria-describedby={error ? 'users-error' : undefined} className="input num" placeholder="ຫວ່າງ = ໃຊ້ເບີໂທ"
                value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary"
              disabled={!username || !fullName || newPassword.length < 8 || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
            </button>
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍຊື່ຜູ້ໃຊ້ງານ</h2>
          <span className="num text-xs text-muted">{users.length} ຄົນ</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍຊື່ຜູ້ໃຊ້ງານ">
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
              <TableStateRow
                colSpan={8}
                isError={usersFailed}
                error={usersError}
                isEmpty={false}
                emptyText=""
                onRetry={() => void refetchUsers()}
              />
              {pager.pageItems.map((user) => (
                <tr key={user.id}>
                  <td className="font-mono text-xs">{user.username}</td>
                  <td className="font-medium">{user.fullName}</td>
                  <td>
                    <select
                      aria-label={`ສິດຜູ້ໃຊ້ — ${user.username}`}
                      className="input w-44"
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
                    <label className="flex min-h-[42px] cursor-pointer items-center gap-2 text-xs text-fg">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--gold)]"
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
                    <span className={user.isActive ? 'status-success' : 'badge recessed text-muted'}>
                      {user.isActive ? 'ໃຊ້ງານຢູ່' : 'ປິດການນຳໃຊ້'}
                    </span>
                  </td>
                  <td className="num text-muted">{formatDateTime(user.lastLoginAt)}</td>
                  <td className="text-right">
                    {resetting === user.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <input type="password" className="input w-40"
                          aria-label={`ລະຫັດຜ່ານໃໝ່ — ${user.username}`}
                          placeholder="ລະຫັດຜ່ານໃໝ່" value={password}
                          onChange={(e) => setPassword(e.target.value)} autoFocus />
                        <button className="btn-primary"
                          onClick={() => reset.mutate(user.id)}
                          disabled={password.length < 8 || reset.isPending}>
                          ບັນທຶກ
                        </button>
                        <button className="btn-secondary"
                          onClick={() => setResetting(null)}>
                          ຍົກເລີກ
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button className="btn-ghost"
                          onClick={() => { setResetting(user.id); setPassword(''); }}>
                          ປ່ຽນລະຫັດຜ່ານ
                        </button>
                        <button
                          className={user.isActive ? 'btn-danger' : 'btn-ghost text-success'}
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
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          ການປ່ຽນລະຫັດຜ່ານຈະຍົກເລີກ session ທັງໝົດຂອງຜູ້ໃຊ້ນັ້ນທັນທີ.
          Admin ຄົນສຸດທ້າຍບໍ່ສາມາດຖືກປິດການນຳໃຊ້ໄດ້.
          ຕິກ WhatsApp ເພື່ອໃຫ້ຜູ້ໃຊ້ນັ້ນໄດ້ຮັບການແຈ້ງເຕືອນທາງ WhatsApp ນຳ.
        </p>
      </div>
    </div>
  );
}
