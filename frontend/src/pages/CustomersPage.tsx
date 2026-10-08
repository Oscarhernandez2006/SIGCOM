import { useState, useMemo } from 'react';
import {
  Search,
  Users,
  Phone,
  Tag,
  Wallet,
  X,
  AlertCircle,
  FileDown,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  useClients,
  useClientPortfolio,
  useClientPortfolios,
} from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { useCompany } from '@/company/useCompany';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import {
  exportClientPortfolioPdf,
  exportSellerPortfolioPdf,
} from '@/lib/cartera-pdf';
import type { Client } from '@/types';

/** Extrae el mensaje de error que envía el backend, si lo hay. */
function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'No se pudo consultar la cartera.';
}

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [portfolioClient, setPortfolioClient] = useState<Client | null>(null);
  const { data: customers = [], isLoading } = useClients(search);
  const { user } = useAuth();
  const { company } = useCompany();

  // La cartera es por NIT (misma para todas las sucursales). Se muestra un solo
  // cliente por código/NIT para no repetir la misma información.
  const uniqueCustomers = useMemo(() => {
    const seen = new Set<string>();
    const out: Client[] = [];
    for (const c of customers) {
      const key = c.code.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, [customers]);

  // Saldos de cartera de todos los clientes, para ordenar por deuda.
  const nits = useMemo(
    () => uniqueCustomers.map((c) => c.code.trim()),
    [uniqueCustomers],
  );
  const { balances, portfolios, isLoading: isLoadingBalances } =
    useClientPortfolios(nits);

  // Los clientes en deuda van primero (mayor saldo arriba); el resto conserva
  // su orden original.
  const sortedCustomers = useMemo(() => {
    return [...uniqueCustomers].sort((a, b) => {
      const balanceA = balances[a.code.trim()] ?? 0;
      const balanceB = balances[b.code.trim()] ?? 0;
      return balanceB - balanceA;
    });
  }, [uniqueCustomers, balances]);

  const handleExportSeller = () => {
    void exportSellerPortfolioPdf({
      sellerName: user?.name ?? 'Vendedor',
      companyId: company?.id,
      companyName: company?.name ?? '',
      clients: uniqueCustomers,
      portfolios,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Cartera de Clientes
          </h2>
          <p className="text-muted-foreground">
            Terceros sincronizados desde Siesa.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportSeller}
          disabled={customers.length === 0 || isLoadingBalances}
          title={
            isLoadingBalances
              ? 'Consultando la cartera de tus clientes…'
              : 'Descargar el informe de cartera de todos tus clientes'
          }
        >
          <FileDown className="h-4 w-4" />
          {isLoadingBalances ? 'Cargando cartera…' : 'Informe de cartera (PDF)'}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o código..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No hay clientes. Sincroniza los terceros desde Siesa.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {sortedCustomers.map((customer) => (
            <div
              key={customer.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="font-medium leading-tight">{customer.name}</p>
                  <span className="text-xs text-muted-foreground">
                    Cód. {customer.code}
                  </span>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {customer.priceList && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {customer.priceListName || customer.priceList}
                    </span>
                  )}
                  {customer.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:shrink-0">
                <CardPortfolioBalance balance={balances[customer.code.trim()]} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPortfolioClient(customer)}
                >
                  <Wallet className="h-4 w-4" />
                  Ver cartera
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {portfolioClient && (
        <PortfolioModal
          client={portfolioClient}
          sellerName={user?.name ?? 'Vendedor'}
          companyId={company?.id}
          companyName={company?.name ?? ''}
          onClose={() => setPortfolioClient(null)}
        />
      )}
    </div>
  );
}

/**
 * Saldo total pendiente de un cliente, consultado en vivo a Siesa y mostrado
 * dentro de su card. Muestra un estado de carga discreto mientras resuelve.
 */
/**
 * Saldo total pendiente de un cliente, mostrado en su fila. El saldo se
 * resuelve en el componente padre (consulta agrupada) y se pasa como prop.
 */
function CardPortfolioBalance({ balance }: { balance?: number }) {
  if (balance === undefined) {
    return (
      <span className="text-xs text-muted-foreground">Consultando...</span>
    );
  }

  const hasDebt = balance > 0;
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap',
        hasDebt
          ? 'bg-destructive/10 text-destructive'
          : 'bg-[var(--success)]/10 text-[var(--success)]',
      )}
    >
      <Wallet className="h-3.5 w-3.5" />
      <span className="font-bold">{formatCurrency(balance)}</span>
    </div>
  );
}

/** Modal con la cartera (documentos por cobrar) de un cliente. */
function PortfolioModal({
  client,
  sellerName,
  companyId,
  companyName,
  onClose,
}: {
  client: Client;
  sellerName: string;
  companyId?: string;
  companyName: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useClientPortfolio(
    client.code.trim(),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <Card
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-5 w-5 text-primary" />
              Cartera · {client.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              NIT/Código {client.code.trim()}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                data &&
                void exportClientPortfolioPdf({
                  client,
                  portfolio: data,
                  companyId,
                  companyName,
                  sellerName,
                })
              }
              disabled={!data}
            >
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Consultando cartera…
            </p>
          ) : isError ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{getErrorMessage(error)}</span>
            </div>
          ) : !data || data.documents.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              El cliente no tiene documentos pendientes en cartera.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
                <span className="text-sm font-medium text-primary">
                  Saldo total pendiente ({data.count} documento
                  {data.count === 1 ? '' : 's'})
                </span>
                <span className="text-lg font-bold text-primary">
                  {formatCurrency(data.totalBalance)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Documento</th>
                      <th className="px-2 py-2 font-medium">Tipo</th>
                      <th className="px-2 py-2 font-medium">Fecha factura</th>
                      <th className="px-2 py-2 font-medium">Vence</th>
                      <th className="px-2 py-2 font-medium">Sucursal</th>
                      <th className="px-2 py-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((d, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-2 py-2 font-mono text-xs">
                          {d.documentNumber}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {d.description || d.docType || '—'}
                        </td>
                        <td className="px-2 py-2 text-xs whitespace-nowrap">
                          {formatDate(d.invoiceDate)}
                        </td>
                        <td className="px-2 py-2 text-xs whitespace-nowrap">
                          {formatDate(d.dueDate)}
                        </td>
                        <td className="px-2 py-2 text-xs">{d.branch}</td>
                        <td className="px-2 py-2 text-right font-medium">
                          {formatCurrency(d.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
