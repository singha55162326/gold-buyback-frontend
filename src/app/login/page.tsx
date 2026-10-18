'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeSession, type SessionUser } from '@/lib/api';
import { LogoMark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { useFadeIn } from '@/lib/use-fade-in';

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
  const [showPassword, setShowPassword] = useState(false);

  useFadeIn();

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

  const errorProps = error
    ? { 'aria-invalid': true as const, 'aria-describedby': 'login-error' }
    : {};

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-16 sm:p-8">
      <ThemeToggle className="absolute right-4 top-4 sm:right-6 sm:top-6" />

      <div className="glass glass-lg login-card grid w-full max-w-[1040px] overflow-hidden lg:grid-cols-[1.05fr_1fr]">
        <div
          data-fade
          data-surface="dark"
          className="flex flex-col items-center justify-center px-6 py-8 text-center lg:px-12 lg:py-16"
          style={{ background: 'linear-gradient(160deg, rgba(128,20,16,0.9), rgba(78,10,8,0.94))' }}
        >
          <LogoMark className="h-20 w-20 text-gold lg:h-24 lg:w-24" />
          <h1 className="text-gold-gradient mt-4 font-serif text-[26px] font-bold leading-[1.5] lg:text-[34px]">
            ຮ້ານຄຳພູວົງ
          </h1>
          <div className="font-latin text-[12px] font-semibold uppercase tracking-[0.42em] text-gold lg:text-[14px]">
            Khamphouvong
          </div>
          <div className="divider-diamond my-5 w-32 lg:my-6 lg:w-40" aria-hidden="true" />
          <div className="text-sm font-light text-fg lg:text-[15px]">ລະບົບບໍລິຫານຈັດການຮ້ານຄຳ</div>
        </div>

        <div className="flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-12 lg:py-14">
          <form onSubmit={submit} className="space-y-5" data-fade>
            <div>
              <label className="label" htmlFor="username">
                ຊື່ຜູ້ໃຊ້
              </label>
              <div className="input-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
                </svg>
                <input
                  id="username"
                  className="input input-lg"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  {...errorProps}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">
                ລະຫັດຜ່ານ
              </label>
              <div className="input-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
                  <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input input-lg pr-14"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  {...errorProps}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label="ສະແດງລະຫັດຜ່ານ"
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 inline-flex h-[42px] w-[42px] -translate-y-1/2 items-center justify-center rounded-[12px] text-gold transition-colors hover:bg-[var(--recessed)]"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
                    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword && <path d="M4 4l16 16" />}
                  </svg>
                </button>
              </div>
            </div>

            {error && (
              <div id="login-error" role="alert"
                className="notice status-danger">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary h-[54px] w-full text-base" disabled={busy}>
              {busy ? 'ກຳລັງເຂົ້າສູ່ລະບົບ...' : 'ເຂົ້າສູ່ລະບົບ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
