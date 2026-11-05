import { useEffect, useMemo, useState } from 'react';
import {
  Tags,
  RefreshCw,
  Check,
  AlertCircle,
  Search,
  Building2,
  ChevronRight,
  ChevronLeft,
  Printer,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  usePriceLists,
  usePriceListItems,
  useSyncPriceLists,
  downloadPriceListPdf,
} from '@/hooks/useAdminApi';
import { COMPANIES } from '@/lib/companies';
import { formatCurrency, cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { PageBackground, Hero, BrandButton, StatusPill } from '@/components/brand/PageShell';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/brand/Panel';

const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;

/** Extrae el mensaje de error que envía el backend, si lo hay. */
function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'No se pudo completar la operación.';
}

const LISTS_PER_PAGE = 5;
const ITEMS_PER_PAGE = 10;

export function PriceListsPage() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [listPage, setListPage] = useState(1);
  const [itemPage, setItemPage] = useState(1);
  const [printing, setPrinting] = useState(false);

  const { data: lists = [], isLoading: loadingLists } =
    usePriceLists(companyId);
  const { data: items = [], isLoading: loadingItems } = usePriceListItems(
    companyId,
    selectedList,
    search,
  );
  const syncPriceLists = useSyncPriceLists();

  const company = COMPANIES.find((c) => c.id === companyId)!;
  const currentList = lists.find((l) => l.listCode === selectedList);

  // Listas filtradas por el buscador (nombre o código).
  const filteredLists = useMemo(() => {
    const term = listSearch.trim().toLowerCase();
    if (!term) return lists;
    return lists.filter(
      (l) =>
        l.listName.toLowerCase().includes(term) ||
        l.listCode.toLowerCase().includes(term),
    );
  }, [lists, listSearch]);

  const listTotalPages = Math.max(
    1,
    Math.ceil(filteredLists.length / LISTS_PER_PAGE),
  );
  const pagedLists = filteredLists.slice(
    (listPage - 1) * LISTS_PER_PAGE,
    listPage * LISTS_PER_PAGE,
  );

  const itemTotalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const pagedItems = items.slice(
    (itemPage - 1) * ITEMS_PER_PAGE,
    itemPage * ITEMS_PER_PAGE,
  );

  // Volver a la primera página cuando cambian los filtros o los datos.
  useEffect(() => {
    setListPage(1);
  }, [listSearch, companyId]);
  useEffect(() => {
    setItemPage(1);
  }, [search, selectedList, companyId]);

  function handleCompany(id: string) {
    setCompanyId(id);
    setSelectedList(null);
    setSearch('');
    setListSearch('');
  }

  function handleSync() {
    syncPriceLists.mutate(companyId);
  }

  async function handlePrint() {
    if (!selectedList) return;
    setPrinting(true);
    try {
      await downloadPriceListPdf(companyId, selectedList);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <PageBackground className="space-y-3.5">
      <div>
        <Hero>
        <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">Listas de precios</h2>
        <p className="mt-1 text-sm font-semibold text-white/90">Listas de precios sincronizadas desde Siesa. Cada lista se asigna a
          los clientes según su tipo.</p>
      </Hero>
      </div>

      {/* Selector de compañía */}
      <div className="flex flex-wrap gap-2">
        {COMPANIES.map((c) => (
          <button
            key={c.id}
            onClick={() => handleCompany(c.id)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
              companyId === c.id
                ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
            )}
          >
            <Building2 className="h-4 w-4" />
            {c.name}
            <span className="text-xs opacity-70">#{c.id}</span>
          </button>
        ))}
      </div>

      {/* Acción de sincronización */}
      <Panel>
        <PanelBody className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1E9B50]/10 text-[#1E9B50]">
              <Tags className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Listas de precios · {company.name}</p>
              <p className="text-xs text-[#6B7280]">
                La sincronización trae los cambios desde Siesa y actualiza la
                base de datos.
              </p>
            </div>
          </div>
          <BrandButton className="h-9 px-3" disabled={syncPriceLists.isPending} onClick={handleSync}>
            <RefreshCw
              className={cn(
                'h-4 w-4',
                syncPriceLists.isPending && 'animate-spin',
              )}
            />
            {syncPriceLists.isPending ? 'Sincronizando…' : 'Sincronizar'}
          </BrandButton>
        </PanelBody>
      </Panel>

      {/* Resultado de la sincronización */}
      {syncPriceLists.isSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-[#1E9B50]/30 bg-[#1E9B50]/10 px-4 py-3 text-sm text-[#1E9B50]">
          <Check className="h-4 w-4" />
          <span>
            {syncPriceLists.data.lists} listas ·{' '}
            {syncPriceLists.data.created} nuevas ·{' '}
            {syncPriceLists.data.updated} actualizadas ·{' '}
            {syncPriceLists.data.removed} eliminadas.
          </span>
        </div>
      )}
      {syncPriceLists.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>{getErrorMessage(syncPriceLists.error)}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Listado de listas */}
        <Panel>
          <PanelHeader className="space-y-3">
            <PanelTitle className="">
              Listas ({filteredLists.length})
            </PanelTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              <input className="brand-input h-10 w-full rounded-xl pl-10 pr-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                placeholder="Buscar lista…"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
            />
            </div>
          </PanelHeader>
          <PanelBody className="space-y-1">
            {loadingLists ? (
              <p className="py-4 text-center text-sm text-[#6B7280]">
                Cargando…
              </p>
            ) : lists.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#6B7280]">
                No hay listas. Sincroniza desde Siesa.
              </p>
            ) : filteredLists.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#6B7280]">
                Sin resultados para “{listSearch}”.
              </p>
            ) : (
              pagedLists.map((l) => (
                <button
                  key={l.listCode}
                  onClick={() => setSelectedList(l.listCode)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    selectedList === l.listCode
                      ? 'border-[#1E9B50] bg-[#1E9B50]/10'
                      : 'border-transparent hover:bg-[#F4FAF6]',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.listName}</p>
                    <p className="text-xs text-[#6B7280]">
                      #{l.listCode} · {l.itemCount} productos
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7280]" />
                </button>
              ))
            )}

            {filteredLists.length > LISTS_PER_PAGE && (
              <div className="flex items-center justify-between gap-2 pt-2">
                <BrandButton variant="outlined" className="h-9 px-3" disabled={listPage <= 1} onClick={() => setListPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </BrandButton>
                <span className="text-xs text-[#6B7280]">
                  {listPage} / {listTotalPages}
                </span>
                <BrandButton variant="outlined" className="h-9 px-3" disabled={listPage>= listTotalPages}
                  onClick={() =>
                    setListPage((p) => Math.min(listTotalPages, p + 1))
                  }
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </BrandButton>
              </div>
            )}
          </PanelBody>
        </Panel>

        {/* Ítems de la lista seleccionada */}
        <Panel>
          <PanelHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <PanelTitle className="">
              {currentList ? currentList.listName : 'Selecciona una lista'}
            </PanelTitle>
            {selectedList && (
              <div className="flex w-full max-w-xl items-center gap-2">
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input className="brand-input h-10 w-full rounded-xl pl-10 pr-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                    placeholder="Buscar producto o referencia…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
            />
                </div>
                <BrandButton variant="outlined" className="h-10 shrink-0 whitespace-nowrap" onClick={handlePrint} disabled={printing}>
                  <Printer className="h-4 w-4" />
                  {printing ? 'Generando…' : 'Imprimir lista de precios'}
                </BrandButton>
              </div>
            )}
          </PanelHeader>
          <PanelBody>
            {!selectedList ? (
              <p className="py-10 text-center text-sm text-[#6B7280]">
                Elige una lista para ver sus productos y precios.
              </p>
            ) : loadingItems ? (
              <p className="py-10 text-center text-sm text-[#6B7280]">
                Cargando productos…
              </p>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#6B7280]">
                Sin resultados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[#6B7280]">
                      <th className="px-2 py-2 font-medium">Referencia</th>
                      <th className="px-2 py-2 font-medium">Producto</th>
                      <th className="px-2 py-2 font-medium">U.M.</th>
                      <th className="px-2 py-2 text-right font-medium">
                        Precio
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedItems.map((it) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="px-2 py-2 font-mono text-xs">
                          {it.reference}
                        </td>
                        <td className="px-2 py-2">{it.productName}</td>
                        <td className="px-2 py-2">
                          {it.unitOfMeasure ? (
                            <StatusPill label={it.unitOfMeasure} color={BRAND.textMuted} />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {formatCurrency(Number(it.price))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between gap-2 pt-3">
                  <span className="text-xs text-[#6B7280]">
                    {items.length} producto{items.length === 1 ? '' : 's'}
                    {items.length === 500 && ' (máx.)'}
                  </span>
                  {items.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center gap-2">
                      <BrandButton variant="outlined" className="h-9 px-3" disabled={itemPage <= 1} onClick={() => setItemPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </BrandButton>
                      <span className="text-xs text-[#6B7280]">
                        {itemPage} / {itemTotalPages}
                      </span>
                      <BrandButton variant="outlined" className="h-9 px-3" disabled={itemPage>= itemTotalPages}
                        onClick={() =>
                          setItemPage((p) => Math.min(itemTotalPages, p + 1))
                        }
                      >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                      </BrandButton>
                    </div>
                  )}
                </div>
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>
    </PageBackground>
  );
}
