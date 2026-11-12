import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CertificateClientOption,
  CertificateData,
  CommercialCertificate,
} from '@/types';

const headers = (companyId: string) => ({ 'X-Company-Id': companyId });

/** Consecutivo visible del certificado (igual que en el PDF). */
export function certificateCode(c: Pick<CommercialCertificate, 'companyId' | 'number'>): string {
  return `CRC-${c.companyId}-${String(c.number).padStart(6, '0')}`;
}

/** Clientes de la compañía para elegir a quién certificar. */
export function useCertificateClients(companyId: string, search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ['certificates', 'clients', companyId, term],
    enabled: term.length >= 2,
    queryFn: async () => {
      const res = await api.get<CertificateClientOption[]>('/certificates/clients', {
        params: { search: term },
        headers: headers(companyId),
      });
      return res.data;
    },
  });
}

export interface CertificateQuery {
  companyId: string;
  nit: string;
  from: string;
  to: string;
}

/** Datos verificados en Siesa para el cliente y periodo (vista previa). */
export function useCertificatePreview(query: CertificateQuery | null) {
  return useQuery({
    queryKey: ['certificates', 'preview', query],
    enabled: !!query,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { companyId, ...params } = query!;
      const res = await api.get<CertificateData>('/certificates/preview', {
        params,
        headers: headers(companyId),
      });
      return res.data;
    },
  });
}

/** Certificados emitidos en la compañía. */
export function useCertificates(companyId: string, search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ['certificates', 'list', companyId, term],
    queryFn: async () => {
      const res = await api.get<CommercialCertificate[]>('/certificates', {
        params: term ? { search: term } : undefined,
        headers: headers(companyId),
      });
      return res.data;
    },
  });
}

/** Emite el certificado (lo guarda como soporte con su PDF). */
export function useIssueCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      ...body
    }: CertificateQuery & { addressedTo?: string; notes?: string }) => {
      const res = await api.post<CommercialCertificate>('/certificates', body, {
        headers: headers(companyId),
      });
      return res.data;
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['certificates', 'list', vars.companyId] }),
  });
}

/** Descarga el PDF guardado de un certificado. */
export async function downloadCertificatePdf(cert: CommercialCertificate): Promise<void> {
  const res = await api.get(`/certificates/${cert.id}/pdf`, {
    responseType: 'blob',
    headers: headers(cert.companyId),
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${certificateCode(cert)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
