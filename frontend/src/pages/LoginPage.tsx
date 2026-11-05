import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IdCard,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { BrandBackground } from '@/components/BrandBackground';
import { BRAND as COLORS } from '@/lib/brand';

const REMEMBER_KEY = 'sigcom.login.document';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(
    () => localStorage.getItem(REMEMBER_KEY) ?? '',
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(
    () => localStorage.getItem(REMEMBER_KEY) !== null,
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
      else localStorage.removeItem(REMEMBER_KEY);
      // Todos entran al área operativa y eligen compañía; ahí ven en una sola
      // barra los módulos habilitados (el admin ve todos). Divididos por compañía.
      navigate('/');
    } catch {
      setError('Credenciales inválidas. Verifica tu cédula y contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'h-[54px] w-full rounded-[14px] border bg-[#F1F5F9] pl-12 pr-3 text-[15px] font-medium text-[#111827] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#1E9B50] focus:bg-white focus:ring-2 focus:ring-[#1E9B50]/20 disabled:opacity-60';

  const card = (
    <div
      className="rounded-[28px] bg-white px-6 pb-6 pt-8 sm:px-7"
      style={{
        border: `1px solid ${COLORS.border}B3`,
        boxShadow: `0 16px 40px ${COLORS.primaryDark}14`,
      }}
    >
      <div className="text-center">
        <h1
          className="text-[28px] font-extrabold tracking-tight"
          style={{ color: COLORS.text }}
        >
          Bienvenido
        </h1>
        <p
          className="mt-1.5 text-sm font-medium"
          style={{ color: COLORS.textMuted }}
        >
          Ingresa tus credenciales para acceder al sistema.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-7" noValidate>
        <label
          htmlFor="username"
          className="mb-2 block pl-0.5 text-[15px] font-bold"
          style={{ color: COLORS.text }}
        >
          Cédula
        </label>
        <div className="relative">
          <IdCard
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
            style={{ color: COLORS.textSoft }}
          />
          <input
            id="username"
            type="text"
            inputMode="numeric"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Número de cédula"
            required
            disabled={loading}
            className={inputClass}
            style={{ borderColor: COLORS.border }}
          />
        </div>

        <label
          htmlFor="password"
          className="mb-2 mt-5 block pl-0.5 text-[15px] font-bold"
          style={{ color: COLORS.text }}
        >
          Contraseña
        </label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
            style={{ color: COLORS.textSoft }}
          />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={loading}
            className={`${inputClass} pr-12`}
            style={{ borderColor: COLORS.border }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-black/5"
            style={{ color: COLORS.textSoft }}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        <label
          className="mt-1.5 flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] py-1.5"
          style={{ color: COLORS.textMuted }}
        >
          <input
            type="checkbox"
            checked={remember}
            disabled={loading}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-[18px] w-[18px] cursor-pointer rounded-[6px] accent-[#1E9B50]"
            style={{ borderColor: COLORS.textSoft }}
          />
          <span className="text-sm font-semibold">Recordar contraseña</span>
        </label>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm font-semibold"
            style={{
              color: '#B3261E',
              backgroundColor: '#B3261E14',
              border: '1px solid #B3261E40',
            }}
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[14px] text-[17px] font-bold text-white transition-colors hover:brightness-95 disabled:opacity-70"
          style={{ backgroundColor: COLORS.primary }}
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Ingresando...
            </>
          ) : (
            <>
              <LogIn className="h-[22px] w-[22px]" />
              Ingresar
            </>
          )}
        </button>
      </form>

      <p
        className="mt-5 text-center text-xs font-medium leading-relaxed"
        style={{ color: COLORS.textMuted }}
      >
        ¿Problemas para acceder? Contacta al administrador del sistema.
      </p>
    </div>
  );

  const footer = (
    <div className="text-center">
      <p
        className="text-xs font-semibold tracking-wide"
        style={{ color: COLORS.textMuted }}
      >
        SIGCOM · Sistema de Gestión Comercial
      </p>
      <p
        className="mx-auto mt-2.5 max-w-xs text-xs italic leading-relaxed"
        style={{ color: COLORS.textSoft }}
      >
        «Encomienda a Jehová tus obras, y tus pensamientos serán afirmados.»
      </p>
      <p
        className="mt-0.5 text-xs font-semibold"
        style={{ color: COLORS.textSoft }}
      >
        Proverbios 16:3
      </p>
    </div>
  );

  return (
    <BrandBackground className="flex min-h-screen items-center justify-center px-5 py-6">
      <div className="login-fade-in flex w-full items-center justify-center gap-14">
        {/* Logo Santacruz — lado izquierdo en pantallas anchas */}
        <img
          src="/logo-santacruz.png"
          alt="Frigorífico Agropecuaria Santacruz"
          className="hidden w-60 shrink-0 object-contain lg:block"
        />

        <div className="flex w-full max-w-[440px] flex-col items-center">
          <img
            src="/sigcom-logo.png"
            alt="SIGCOM · Sistema de Gestión Comercial"
            className="h-24 object-contain"
          />
          <div className="mt-6 w-full">{card}</div>

          {/* Logos para pantallas pequeñas */}
          <div className="mt-6 flex items-center justify-center lg:hidden">
            <img
              src="/logo-santacruz.png"
              alt="Frigorífico Agropecuaria Santacruz"
              className="h-14 object-contain"
            />
            <div
              className="mx-5 h-10 w-px"
              style={{ backgroundColor: COLORS.border }}
            />
            <img
              src="/logo-carnesfrias.png"
              alt="Carnes Frías Santacruz"
              className="h-14 object-contain"
            />
          </div>

          <div className="mt-6">{footer}</div>
        </div>

        {/* Logo Carnes Frías — lado derecho en pantallas anchas */}
        <img
          src="/logo-carnesfrias.png"
          alt="Carnes Frías Santacruz"
          className="hidden w-[170px] shrink-0 object-contain lg:block"
        />
      </div>
    </BrandBackground>
  );
}
