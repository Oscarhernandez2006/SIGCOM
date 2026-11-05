import { useMemo, useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import {
  useProducts,
  useFeaturedProducts,
  useAddFeaturedProduct,
  useRemoveFeaturedProduct,
} from '@/hooks/useApi';
import { useCompany } from '@/company/useCompany';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { PageBackground, Hero } from '@/components/brand/PageShell';
import { Panel, PanelBody } from '@/components/brand/Panel';

const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;

export function FeaturedProductsPage() {
  const { company } = useCompany();
  const [search, setSearch] = useState('');
  const { data: products = [], isLoading } = useProducts(search);
  const { data: featured = [] } = useFeaturedProducts();
  const addFeatured = useAddFeaturedProduct();
  const removeFeatured = useRemoveFeaturedProduct();

  const featuredSkus = useMemo(
    () => new Set(featured.map((f) => f.sku)),
    [featured],
  );

  const toggle = (sku: string, name: string) => {
    if (featuredSkus.has(sku)) {
      removeFeatured.mutate(sku);
    } else {
      addFeatured.mutate({ sku, name });
    }
  };

  return (
    <PageBackground className="space-y-3.5">
      {/* Encabezado */}
      <div>
        <Hero>
        <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">Productos estrella</h2>
        <p className="mt-1 text-sm font-semibold text-white/90">Marca uno o varios productos como estrella/favorito del día para{' '}
          <span className="font-extrabold text-white">
            {company?.name ?? 'la compañía'}
          </span>
          . Los vendedores los verán de primero y recibirán un aviso si crean un
          pedido sin incluirlos.</p>
      </Hero>
      </div>

      {/* Productos estrella actuales */}
      <Panel>
        <PanelBody className="space-y-3 p-5">
          <h3 className="text-sm font-semibold">
            Marcados actualmente ({featured.length})
          </h3>
          {featured.length === 0 ? (
            <p className="text-sm text-[#6B7280]">
              Aún no hay productos marcados como estrella.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {featured.map((f) => (
                <span
                  key={f.sku}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800"
                >
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                  <span className="max-w-[16rem] truncate">{f.name}</span>
                  <button
                    onClick={() => removeFeatured.mutate(f.sku)}
                    className="text-amber-500 transition-colors hover:text-amber-700"
                    aria-label={`Quitar ${f.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </PanelBody>
      </Panel>

      {/* Buscador y catálogo */}
      <Panel>
        <PanelBody className="space-y-4 p-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            <input className="brand-input h-10 rounded-xl pl-9 pr-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre o SKU..."
            />
          </div>

          <div className="max-h-[30rem] space-y-1.5 overflow-auto pr-0.5">
            {isLoading ? (
              <p className="px-3 py-2 text-sm text-[#6B7280]">
                Cargando productos...
              </p>
            ) : products.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[#6B7280]">
                No se encontraron productos.
              </p>
            ) : (
              products.map((p) => {
                const isFeatured = featuredSkus.has(p.sku);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.sku, p.name)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all',
                      isFeatured
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-[#E2E8F0] hover:border-amber-300/60 hover:bg-[#F4FAF6]',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <span className="font-mono text-xs text-[#6B7280]">
                        {p.sku}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                        isFeatured
                          ? 'bg-amber-400 text-amber-950'
                          : 'bg-[#EEF2F7] text-[#6B7280]',
                      )}
                    >
                      <Star
                        className={cn(
                          'h-3.5 w-3.5',
                          isFeatured && 'fill-amber-950',
                        )}
                      />
                      {isFeatured ? 'Estrella' : 'Marcar'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </PanelBody>
      </Panel>
    </PageBackground>
  );
}
