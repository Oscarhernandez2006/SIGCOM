import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Download,
  PackageOpen,
  X,
  FileText,
  Tag,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  useProductsInStock,
  useCompanyPriceLists,
  fetchStockPdf,
  saveStockPdf,
} from '@/hooks/useApi';
import { formatMoney, formatQuantity } from '@/lib/format';
import { BRAND } from '@/lib/brand';
import {
  PageBackground,
  Hero,
  EmptyMessage,
  Modal,
  BrandButton,
  Segmented,
} from '@/components/brand/PageShell';
import { FadeIn } from '@/components/dashboard/primitives';
import type { Product } from '@/types';

type PriceListRef = { listCode: string; listName: string };
type Species = 'all' | 'beef' | 'pork';

const isPork = (p: Product) => p.category?.toUpperCase() === 'CERDO';

/**
 * Disponibilidad de stock para el vendedor: muestra los productos con
 * existencias y, si se elige una lista de precios, su precio en esa lista.
 * El PDF se previsualiza en un modal antes de descargarlo.
 */
export function StockPage() {
  const [search, setSearch] = useState('');
  const [priceList, setPriceList] = useState('');
  const [species, setSpecies] = useState<Species>('all');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const { data: products = [], isLoading, isFetching, isError, error, refetch } =
    useProductsInStock(search, priceList || undefined);
  const { data: priceLists = [] } = useCompanyPriceLists();

  const selectedList = priceLists.find((l) => l.listCode === priceList) ?? null;
  const porkCount = useMemo(() => products.filter(isPork).length, [products]);
  const visible = useMemo(
    () =>
      products.filter((p) =>
        species === 'all' ? true : species === 'pork' ? isPork(p) : !isPork(p),
      ),
    [products, species],
  );
  const count = products.length;

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
            Disponibilidad
          </h2>
          {isFetching && <Loader2 className="h-[18px] w-[18px] animate-spin text-white" />}
          <button
            type="button"
            onClick={() => setPdfOpen(true)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.16] px-3.5 text-[13px] font-bold transition-colors hover:bg-white/25"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
        <p className="mt-1 text-sm font-semibold text-white/90">
          {isLoading
            ? 'Productos con existencias para vender hoy'
            : `${count} referencia${count === 1 ? '' : 's'} disponible${count === 1 ? '' : 's'} hoy`}
        </p>
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="mt-3.5 flex h-12 w-full items-center gap-2 rounded-[14px] bg-white px-3 text-left text-[13.5px] font-bold transition-colors hover:bg-[#F4FAF6]"
          style={{ color: BRAND.text }}
        >
          <Tag className="h-[18px] w-[18px] shrink-0" style={{ color: BRAND.primary }} />
          <span className="flex-1 truncate">
            {selectedList
              ? `Precios: ${selectedList.listName} (${selectedList.listCode})`
              : 'Sin precios (solo disponibilidad)'}
          </span>
          <ChevronDown className="h-5 w-5 shrink-0" style={{ color: BRAND.textSoft }} />
        </button>
        <div className="relative mt-2.5">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2"
            style={{ color: BRAND.textSoft }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o referencia"
            className="h-11 w-full rounded-[14px] bg-white pl-10 pr-3 text-sm font-medium outline-none"
            style={{ color: BRAND.text }}
          />
        </div>
      </Hero>

      {count > 0 && (
        <Segmented<Species>
          value={species}
          onChange={setSpecies}
          options={[
            { value: 'all', label: `Todos (${count})` },
            { value: 'beef', label: `Res (${count - porkCount})` },
            { value: 'pork', label: `Cerdo (${porkCount})` },
          ]}
        />
      )}

      {isError ? (
        <EmptyMessage
          icon={AlertCircle}
          text={error instanceof Error ? error.message : 'No se pudo cargar la disponibilidad.'}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-2xl bg-white"
              style={{ border: `1px solid ${BRAND.border}CC` }}
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyMessage
          icon={PackageOpen}
          text={
            search
              ? 'No hay productos disponibles con esa búsqueda.'
              : species !== 'all'
                ? 'No hay productos de este tipo con existencias.'
                : priceList
                  ? 'No hay productos con existencias en esta lista de precios.'
                  : 'No hay productos con existencias en este momento.'
          }
        />
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">
          {visible.map((p, i) => (
            <FadeIn key={p.id} index={Math.min(i, 12)}>
              <ProductTile product={p} showPrice={!!priceList} />
            </FadeIn>
          ))}
        </div>
      )}

      {listOpen && (
        <PriceListModal
          priceLists={priceLists}
          selected={priceList}
          onSelect={(code) => {
            setPriceList(code);
            setListOpen(false);
          }}
          onClose={() => setListOpen(false)}
        />
      )}

      {pdfOpen && (
        <StockPdfModal
          initialList={priceList}
          priceLists={priceLists}
          onClose={() => setPdfOpen(false)}
        />
      )}
    </PageBackground>
  );
}

function ProductTile({ product, showPrice }: { product: Product; showPrice: boolean }) {
  const sub = [`Ref. ${product.sku}`, product.unitOfMeasure].filter(Boolean).join(' · ');
  return (
    <div
      className="flex items-center gap-3 rounded-2xl bg-white p-3.5"
      style={{ border: `1px solid ${BRAND.border}CC`, color: BRAND.text }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold leading-snug">{product.name}</p>
        <p className="mt-0.5 truncate text-xs" style={{ color: BRAND.textSoft }}>
          {sub}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {showPrice && product.price != null && (
          <p className="font-extrabold">{formatMoney(Number(product.price))}</p>
        )}
        <span
          className="rounded-full px-2 py-[3px] text-xs font-extrabold"
          style={{ backgroundColor: `${BRAND.primary}1A`, color: BRAND.primary }}
        >
          {formatQuantity(Number(product.stock))} disp.
        </span>
      </div>
    </div>
  );
}

function ListRow({
  code,
  name,
  sub,
  icon: Icon,
  selected,
  onSelect,
}: {
  code: string;
  name: string;
  sub: string;
  icon: typeof Tag;
  selected: boolean;
  onSelect: (code: string) => void;
}) {
  const on = selected;
  return (
    <button
      type="button"
      onClick={() => onSelect(code)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#F4FAF6]"
      style={{ backgroundColor: on ? `${BRAND.primary}14` : undefined }}
    >
      <Icon className="h-5 w-5 shrink-0" style={{ color: on ? BRAND.primary : BRAND.textMuted }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{name}</p>
        <p className="text-xs" style={{ color: BRAND.textSoft }}>
          {sub}
        </p>
      </div>
      {on && <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} />}
    </button>
  );
}

/** Hoja para elegir la lista de precios (como _PriceListSheet en la app). */
function PriceListModal({
  priceLists,
  selected,
  onSelect,
  onClose,
}: {
  priceLists: PriceListRef[];
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const filtered = priceLists.filter(
    (l) =>
      !term ||
      l.listName.toLowerCase().includes(term) ||
      l.listCode.toLowerCase().includes(term),
  );

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <h3 className="flex-1 text-xl font-extrabold">Lista de precios</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#F4FAF6]"
          style={{ color: BRAND.textMuted }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-5 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: BRAND.textSoft }}
          />
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar lista"
            className="brand-input h-11 w-full rounded-[14px] pl-9 pr-3 text-sm font-medium outline-none"
            style={{ backgroundColor: BRAND.field, color: BRAND.text }}
          />
        </div>
      </div>
      <div className="max-h-[60vh] flex-1 overflow-auto px-2 pb-3">
        {!term && (
          <ListRow code="" name="Sin precios" sub="Solo disponibilidad" icon={PackageOpen} selected={selected === ''} onSelect={onSelect} />
        )}
        {filtered.map((l) => (
          <ListRow
            key={l.listCode}
            code={l.listCode}
            name={l.listName}
            sub={`Lista ${l.listCode}`}
            icon={Tag}
            selected={selected === l.listCode}
            onSelect={onSelect}
          />
        ))}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: BRAND.textSoft }}>
            Sin listas que coincidan.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Elige la lista de precios, previsualiza el PDF y lo descarga. */
function StockPdfModal({
  initialList,
  priceLists,
  onClose,
}: {
  initialList: string;
  priceLists: PriceListRef[];
  onClose: () => void;
}) {
  const [list, setList] = useState(initialList);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    fetchStockPdf(list || undefined)
      .then((pdf) => {
        if (cancelled) return;
        url = window.URL.createObjectURL(pdf);
        setBlob(pdf);
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (url) window.URL.revokeObjectURL(url);
    };
  }, [list]);

  return (
    <Modal onClose={onClose} className="max-w-4xl sm:h-[90vh]">
      <div className="flex items-start gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-lg font-extrabold">
            <FileText className="h-5 w-5" style={{ color: BRAND.primary }} />
            PDF de disponibilidad
          </h3>
          <p className="text-xs" style={{ color: BRAND.textSoft }}>
            Elige la lista de precios y revisa cómo quedará el PDF antes de descargarlo.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[#F4FAF6]"
          style={{ color: BRAND.textMuted }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
        <label className="mb-1 block text-xs font-bold" style={{ color: BRAND.textMuted }}>
          Lista de precios
        </label>
        <div className="relative max-w-md">
          <Tag
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: BRAND.primary }}
          />
          <select
            value={list}
            onChange={(e) => {
              setLoading(true);
              setError(false);
              setList(e.target.value);
            }}
            className="brand-input h-11 w-full appearance-none rounded-[14px] pl-9 pr-9 text-sm font-semibold outline-none"
            style={{ backgroundColor: BRAND.field, color: BRAND.text }}
          >
            <option value="">Sin precios (solo disponibilidad)</option>
            {priceLists.map((l) => (
              <option key={l.listCode} value={l.listCode}>
                {l.listName} ({l.listCode})
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: BRAND.textSoft }}
          />
        </div>
      </div>

      <div className="relative min-h-[50vh] flex-1" style={{ backgroundColor: BRAND.background }}>
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm" style={{ color: BRAND.textSoft }}>
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND.primary }} />
            Generando vista previa...
          </div>
        ) : error ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-red-700">
            No se pudo generar el PDF. Intenta de nuevo.
          </p>
        ) : previewUrl ? (
          <iframe src={previewUrl} title="Vista previa del PDF" className="h-full w-full" />
        ) : null}
      </div>

      <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: `1px solid ${BRAND.border}` }}>
        <BrandButton variant="outlined" className="h-10" onClick={onClose}>
          Cancelar
        </BrandButton>
        <BrandButton
          className="h-10"
          onClick={() => blob && saveStockPdf(blob)}
          disabled={loading || error || !blob}
        >
          <Download className="h-4 w-4" />
          Descargar PDF
        </BrandButton>
      </div>
    </Modal>
  );
}
