import { useState, type FormEvent } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { api, setToken } from '@/lib/api';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import type { User } from '@/types';

interface PasswordRequirement {
  label: string;
  test: (pw: string) => boolean;
}

const REQUIREMENTS: PasswordRequirement[] = [
  { label: 'Al menos 8 caracteres', test: (pw) => pw.length >= 8 },
  { label: 'Una letra mayúscula', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Una letra minúscula', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Un número', test: (pw) => /\d/.test(pw) },
];

export function ChangePasswordPage() {
  const { user, setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const allValid = REQUIREMENTS.every((r) => r.test(newPassword));
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
  const canSubmit = currentPassword && allValid && passwordsMatch && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setLoading(true);

    try {
      const res = await api.post<{ accessToken: string; user: User }>(
        '/auth/change-password',
        { currentPassword, newPassword },
      );
      setToken(res.data.accessToken);
      setUser(res.data.user);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo cambiar la contraseña.';
      setError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent/30 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-xl shadow-black/5 sm:p-10">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Cambio de contraseña requerido
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Por seguridad, debes establecer una nueva contraseña antes de
              continuar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Sin este campo el navegador no asocia la nueva contraseña al usuario y sigue autocompletando la vieja. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={user?.documentId ?? ''}
              readOnly
              hidden
            />
            {/* Contraseña actual */}
            <div className="space-y-1.5">
              <label
                htmlFor="currentPassword"
                className="text-sm font-semibold text-foreground"
              >
                Contraseña actual
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-12 w-full rounded-xl border border-input bg-secondary/60 pl-11 pr-11 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Nueva contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="newPassword"
                className="text-sm font-semibold text-foreground"
              >
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-12 w-full rounded-xl border border-input bg-secondary/60 pl-11 pr-11 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {showNew ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {/* Indicadores de requisitos */}
              <div className="mt-2 space-y-1">
                {REQUIREMENTS.map((req, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-xs ${
                      req.test(newPassword)
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        req.test(newPassword) ? 'bg-primary' : 'bg-muted-foreground/50'
                      }`}
                    />
                    {req.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Confirmar contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-semibold text-foreground"
              >
                Confirmar nueva contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={`h-12 w-full rounded-xl border bg-secondary/60 pl-11 pr-11 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                    confirmPassword && !passwordsMatch
                      ? 'border-destructive'
                      : 'border-input'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-destructive">
                  Las contraseñas no coinciden.
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-base font-semibold"
              disabled={!canSubmit}
            >
              {loading ? 'Guardando...' : 'Cambiar contraseña'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Hola, {user?.name}. Este cambio es obligatorio por políticas de
            seguridad.
          </p>
        </div>
      </div>
    </div>
  );
}
