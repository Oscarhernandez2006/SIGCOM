import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, getCompanyId, setCompanyId } from '@/lib/api';
import type { Company } from '@/types';
import { useAuth } from '@/auth/useAuth';
import { CompanyContext } from './company-context';

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  // Usuario para el que ya se resolvieron las compañías. Derivar `loading` de
  // aquí evita el render intermedio (usuario listo, compañías aún sin cargar)
  // que mandaba a "seleccionar compañía" al recargar la página.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = !!user && loadedFor !== user.id;

  // Cargamos las compañías disponibles del usuario al iniciar sesion.
  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setCompany(null);
      setLoadedFor(null);
      return;
    }
    let active = true;
    api
      .get<Company[]>('/auth/companies')
      .then((res) => {
        if (!active) return;
        setCompanies(res.data);
        // Restauramos la compañía persistida si sigue siendo valida.
        const savedId = getCompanyId();
        const saved = res.data.find((c) => c.id === savedId) ?? null;
        setCompany(saved);
        if (!saved) setCompanyId(null);
      })
      .catch(() => {
        if (!active) return;
        setCompanies([]);
        setCompany(null);
      })
      .finally(() => {
        if (active) setLoadedFor(user.id);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const selectCompany = useCallback((next: Company) => {
    setCompany(next);
    setCompanyId(next.id);
  }, []);

  const clearCompany = useCallback(() => {
    setCompany(null);
    setCompanyId(null);
  }, []);

  return (
    <CompanyContext.Provider
      value={{ company, companies, loading, selectCompany, clearCompany }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
