import { useEffect, useState } from 'react';
import { Search, Boxes, Download, PackageOpen, X, FileText } from 'lucide-react';
import {
  useProductsInStock,
  useCompanyPriceLists,
  fetchStockPdf,
  saveStockPdf,
} from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

/**
 * Disponibilidad de stock para el vendedor: muestra los productos con
 * existencias y, si se elige una lista de precios, su precio en esa lista.
 * El PDF se previsualiza en un modal antes de descargarlo.
 */
export function StockPage() {
  const [search, setSearch] = useState('');
  const [priceList, setPriceList] = useState('');
  const [pdfOpen, setPdfOpen] = useState(false);
  const { data: products = [], isLoading } = useProductsInStock(
    search,
    priceList || undefined,
  );
  const { data: priceLists = [] } = useCompanyPriceLists();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Disponibilidad</h2>
          <p className="text-muted-foreground">
            Productos con existencias para vender hoy. Descarga el PDF para
            compartirlo con tus clientes.
          </p>
        </div>
        <Button onClick={() => setPdfOpen(true)}>
          <Download className="h-4 w-4" />
          Descargar PDF
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="pl-9"
          />
        </div>
        <div className="w-full max-w-xs">
          <select
            value={priceList}
            onChange={(e) => setPriceList(e.target.value)}
            className={SELECT_CLASS}
            aria-label="Lista de precios"
          >
            <option value="">Sin lista de precios</option>
            {priceLists.map((l) => (
              <option key={l.listCode} value={l.listCode}>
                {l.listName} ({l.listCode})
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <PackageOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search
                ? 'No hay productos disponibles con esa búsqueda.'
                : priceList
                  ? 'No hay productos con existencias en esta lista de precios.'
                  : 'No hay productos con existencias en este momento.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {products.length} referencia{products.length === 1 ? '' : 's'}{' '}
            disponible{products.length === 1 ? '' : 's'}.
          </p>
          <div className="divide-y rounded-lg border">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium leading-tight">
                    {product.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline">{product.sku}</Badge>
                    {product.unitOfMeasure ? (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                        {product.unitOfMeasure}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                  {priceList && product.price != null ? (
                    <span className="text-sm font-semibold">
                      {formatCurrency(Number(product.price))}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--success)]">
                    <Boxes className="h-3 w-3" />
                    {Number(product.stock)} disp.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {pdfOpen ? (
        <StockPdfModal
          initialList={priceList}
          priceLists={priceLists}
          onClose={() => setPdfOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Elige la lista de precios, previsualiza el PDF y lo descarga. */
function StockPdfModal({
  initialList,
  priceLists,
  onClose,
}: {
  initialList: string;
  priceLists: { listCode: string; listName: string }[];
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              PDF de disponibilidad
            </h3>
            <p className="text-sm text-muted-foreground">
              Elige la lista de precios y revisa cómo quedará el PDF antes de
              descargarlo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border p-4">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Lista de precios
          </label>
          <select
            value={list}
            onChange={(e) => {
              setLoading(true);
              setError(false);
              setList(e.target.value);
            }}
            className={`${SELECT_CLASS} max-w-md`}
          >
            <option value="">Sin precios (solo disponibilidad)</option>
            {priceLists.map((l) => (
              <option key={l.listCode} value={l.listCode}>
                {l.listName} ({l.listCode})
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 bg-muted">
          {loading ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Generando vista previa...
            </p>
          ) : error ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-destructive">
              No se pudo generar el PDF. Intenta de nuevo.
            </p>
          ) : previewUrl ? (
            <iframe
              src={previewUrl}
              title="Vista previa del PDF"
              className="h-full w-full"
            />
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => blob && saveStockPdf(blob)}
            disabled={loading || error || !blob}
          >
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
