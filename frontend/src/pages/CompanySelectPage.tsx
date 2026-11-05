import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, LogOut } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCompany } from '@/company/useCompany';
import { BrandBackground } from '@/components/BrandBackground';
import { BRAND } from '@/lib/brand';
import type { Company } from '@/types';

/** Logo (en /public) por compañía; los mismos que usa la app móvil. */
const COMPANY_LOGOS: Record<string, string> = {
  '3': '/logo-santacruz.png',
  '8': '/logo-carnesfrias.png',
  '4': '/logo-carnesfrias.png',
  MTAT: '/logo-santacruz.png',
};

export function CompanySelectPage() {
  const { user, logout } = useAuth();
  const { companies, loading, selectCompany } = useCompany();
  const navigate = useNavigate();

  const firstName = (user?.name ?? '').trim().split(' ')[0] ?? '';

  const handleSelect = (company: Company) => {
    selectCompany(company);
    navigate('/');
  };

  return (
    <BrandBackground className="flex min-h-screen flex-col">
      {/* Cabecera: saludo + cerrar sesión, igual que en la app */}
      <header className="flex items-center gap-3 px-5 pt-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold"
          style={{ backgroundColor: `${BRAND.primary}1F`, color: BRAND.primary }}
        >
          {firstName ? firstName[0].toUpperCase() : '?'}
        </div>
        <p
          className="min-w-0 flex-1 truncate text-base font-bold"
          style={{ color: BRAND.text }}
        >
          Hola, {firstName}
        </p>
        <button
          type="button"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-black/5"
          style={{ color: BRAND.textMuted }}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-8 pt-6">
        <div className="login-fade-in text-center">
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: BRAND.text }}
          >
            Selecciona la compañía
          </h1>
          <p
            className="mt-2 text-sm font-medium leading-relaxed"
            style={{ color: BRAND.textMuted }}
          >
            Cada compañía es independiente: sus clientes, productos y pedidos no
            se mezclan.
          </p>
        </div>

        <div className="mt-7">
          {loading ? (
            <div className="flex justify-center pt-12">
              <div
                className="h-9 w-9 animate-spin rounded-full border-[3px] border-t-transparent"
                style={{ borderColor: `${BRAND.primary} transparent transparent transparent` }}
              />
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center pt-8 text-center">
              <Building2 className="h-12 w-12" style={{ color: BRAND.textSoft }} />
              <p
                className="mt-3 max-w-md text-sm font-medium"
                style={{ color: BRAND.textMuted }}
              >
                No tienes compañías asignadas. Contacta al administrador del
                sistema.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {companies.map((company, index) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  delayMs={80 * index}
                  onSelect={() => handleSelect(company)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </BrandBackground>
  );
}

function CompanyCard({
  company,
  delayMs,
  onSelect,
}: {
  company: Company;
  delayMs: number;
  onSelect: () => void;
}) {
  const logo = COMPANY_LOGOS[company.id];
  const codeLabel = /^\d+$/.test(company.id) ? `COMPAÑÍA ${company.id}` : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="login-fade-in group flex w-full items-center gap-[18px] rounded-[22px] bg-white p-[18px] text-left transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E9B50]"
      style={{
        animationDelay: `${delayMs}ms`,
        border: `1px solid ${BRAND.border}`,
        boxShadow: `0 10px 24px ${BRAND.primaryDark}0F`,
      }}
    >
      <div
        className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-[18px] p-2.5"
        style={{ backgroundColor: BRAND.background }}
      >
        {logo ? (
          <img
            src={logo}
            alt={`Logo ${company.name}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <Building2 className="h-10 w-10" style={{ color: BRAND.primary }} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {codeLabel && (
          <p
            className="text-xs font-bold tracking-[0.06em]"
            style={{ color: BRAND.textSoft }}
          >
            {codeLabel}
          </p>
        )}
        <h2
          className="mt-1 text-[17px] font-extrabold leading-tight"
          style={{ color: BRAND.text }}
        >
          {company.name}
        </h2>
        <span
          className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-bold"
          style={{ color: BRAND.primary }}
        >
          Entrar
          <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </button>
  );
}
