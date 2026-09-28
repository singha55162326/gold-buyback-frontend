'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeSession, type SessionUser } from '@/lib/api';
import { LogoMark } from '@/components/logo';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<LoginResponse>('/auth/login', { username, password });
      storeSession(result.accessToken, result.user);
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
        <div className="mb-6 text-center">
          <LogoMark className="mx-auto mb-3 h-20 w-20 text-gold-500" />
          <div className="text-xl font-bold text-brand-800">ຮ້ານຄຳພູວົງ</div>
          <div className="mt-1 text-sm text-slate-500">ລະບົບບໍລິຫານຈັດການຮ້ານຄຳ</div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="username">
              ຊື່ຜູ້ໃຊ້
            </label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              ລະຫັດຜ່ານ
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'ກຳລັງເຂົ້າສູ່ລະບົບ...' : 'ເຂົ້າສູ່ລະບົບ'}
          </button>
        </form>
      </div>
    </div>
  );
}
