import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Package,
  Check,
  AlertCircle,
  AlertTriangle,
  Search,
  Building2,
  Upload,
  Download,
  Plus,
  Save,
  Pencil,
  X,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  useCompanyProducts,
  useImportInventory,
  useCreateManualProduct,
  useUpdateManualProduct,
  useUpdateStock,
  downloadInventoryTemplate,
} from '@/hooks/useAdminApi';
import { useCompany } from '@/company/useCompany';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';
import { BRAND } from '@/lib/brand';
import { PageBackground, Hero, BrandButton, StatusPill } from '@/components/brand/PageShell';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/brand/Panel';
import { ResponsiveTable } from '@/components/brand/ResponsiveTable';

const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;

/** Extrae el mensaje de error que envía el backend, si lo hay. */
function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'No se pudo cargar el archivo. Verifica el formato.';
}

export function InventoryPage() {
  // Solo las compañías a las que el usuario tiene acceso (admin = todas).
  const { companies } = useCompany();
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // Archivo seleccionado pendiente de confirmar el cargue.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Solo subproductos: especie del archivo a cargar (Bovino=RES / Porcino=CERDO).
  const [pendingSpecies, setPendingSpecies] = useState<'RES' | 'CERDO' | null>(
    null,
  );
  // Tipo de inventario a gestionar/cargar: cortes o subproductos.
  const [invType, setInvType] = useState<'corte' | 'subproducto'>('corte');

  // Selecciona la primera compañía disponible (o ajusta si la actual ya no es válida).
  useEffect(() => {
    if (companies.length > 0 && !companies.some((c) => c.id === companyId)) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  // El inventario de subproductos se administra en AGROPECUARIA.
  const supportsSubproductos = companyId === '3';
  const effectiveType = supportsSubproductos ? invType : 'corte';

  const { data: products = [], isLoading } = useCompanyProducts(
    companyId,
    search,
    effectiveType,
  );
  const importInventory = useImportInventory();
  const createManualProduct = useCreateManualProduct();
  const updateManualProduct = useUpdateManualProduct();
  const updateStock = useUpdateStock();

  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newStock, setNewStock] = useState('0');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editStock, setEditStock] = useState('0');

  const company = companies.find((c) => c.id === companyId);

  // Inventario ordenado por referencia (SKU) de menor a mayor.
  const sortedProducts = useMemo(
    () =>
      [...products].sort((a, b) =>
        a.sku.localeCompare(b.sku, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      ),
    [products],
  );

  // Paginación: 50 productos por página.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
  // Al cambiar de compañía, tipo o búsqueda, vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [companyId, effectiveType, search]);
  // Evita quedar en una página inexistente si baja el total de productos.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pagedProducts = useMemo(
    () => sortedProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedProducts, page],
  );

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // No se carga de inmediato: primero se pide confirmación.
    if (file) setPendingFile(file);
    e.target.value = '';
  }

  function confirmImport() {
    if (!pendingFile) return;
    // Subproductos: se debe elegir la especie (Bovino/Porcino) antes de cargar.
    if (effectiveType === 'subproducto' && !pendingSpecies) return;
    importInventory.mutate({
      companyId,
      file: pendingFile,
      type: effectiveType,
      ...(effectiveType === 'subproducto' && pendingSpecies
        ? { species: pendingSpecies }
        : {}),
    });
    setPendingFile(null);
    setPendingSpecies(null);
  }

  function createProductManually() {
    const sku = newSku.trim();
    const name = newName.trim();
    const stock = Number(newStock);
    if (!sku || !name || Number.isNaN(stock) || stock < 0) return;

    createManualProduct.mutate(
      {
        companyId,
        sku,
        name,
        stock,
        type: effectiveType,
      },
      {
        onSuccess: () => {
          setNewSku('');
          setNewName('');
          setNewStock('0');
          setCreateModalOpen(false);
        },
      },
    );
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product);
    setEditName(product.name);
    setEditStock(String(product.stock));
  }

  function saveManualEdit() {
    if (!editingProduct) return;
    const name = editName.trim();
    const stock = Number(editStock);
    if (!name || Number.isNaN(stock) || stock < 0) return;

    updateManualProduct.mutate(
      {
        companyId,
        id: editingProduct.id,
        name,
        stock,
        type: effectiveType,
      },
      {
        onSuccess: () => {
          setEditingProduct(null);
        },
      },
    );
  }

  return (
    <PageBackground className="space-y-3.5">
      <div>
        <Hero>
        <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">Inventario</h2>
        <p className="mt-1 text-sm font-semibold text-white/90">Carga diaria del inventario desde Excel. Solo el stock es editable
          desde la web.</p>
      </Hero>
      </div>

      {/* Selector de compañía */}
      <div className="flex flex-wrap gap-2">
        {companies.map((c) => (
          <button
            key={c.id}
            onClick={() => setCompanyId(c.id)}
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

      {/* Selector de tipo de inventario (solo MONTERIA TAT AGROPECUARIA) */}
      {supportsSubproductos && (
        <div className="space-y-2">
          <div className="inline-flex gap-2">
            <button
              type="button"
              onClick={() => setInvType('corte')}
              className={cn(
                'h-9 rounded-full px-4 text-[13px] font-bold transition-colors',
                invType === 'corte'
                  ? 'bg-[#1E9B50] text-white'
                  : 'border border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              Cortes
            </button>
            <button
              type="button"
              onClick={() => setInvType('subproducto')}
              className={cn(
                'h-9 rounded-full px-4 text-[13px] font-bold transition-colors',
                invType === 'subproducto'
                  ? 'bg-[#1E9B50] text-white'
                  : 'border border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              Subproductos
            </button>
          </div>
          <p className="text-xs text-[#6B7280]">
            El Excel debe corresponder al tipo seleccionado. Si eliges{' '}
            <strong className="text-[#111827]">{effectiveType}</strong>, el
            sistema bloqueará referencias del otro inventario.
          </p>
        </div>
      )}

      {/* Acciones de inventario */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Panel className="h-full">
          <PanelBody className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1E9B50]/10 text-[#1E9B50]">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Inventario · {company?.name}</p>
                <p className="text-xs text-[#6B7280]">
                  La carga reemplaza todo el inventario de la compañía.
                </p>
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
            />
            <div className="flex flex-wrap gap-2">
              <BrandButton className="h-9 px-3" disabled={importInventory.isPending} onClick={() => fileRef.current?.click()}
              >
                <Upload
                  className={cn(
                    'h-4 w-4',
                    importInventory.isPending && 'animate-pulse',
                  )}
                />
                Cargar Excel
              </BrandButton>
              <BrandButton variant="outlined" className="h-9 px-3" onClick={() => downloadInventoryTemplate()}
              >
                <Download className="h-4 w-4" />
                Descargar plantilla
              </BrandButton>
            </div>

            {importInventory.isSuccess && (
              <p className="flex items-center gap-1 text-xs text-[#1E9B50]">
                <Check className="h-3 w-3" />
                {importInventory.data.total} productos cargados (
                {importInventory.data.created} nuevos,{' '}
                {importInventory.data.updated} actualizados,{' '}
                {importInventory.data.removed} retirados)
              </p>
            )}
            {importInventory.isError && (
              <p className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {getErrorMessage(importInventory.error)}
              </p>
            )}
          </PanelBody>
        </Panel>

        <Panel className="h-full">
          <PanelBody className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1E9B50]/10 text-[#1E9B50]">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Agregar producto manual</p>
                <p className="text-xs text-[#6B7280]">
                  Crea o corrige faltantes sin volver a cargar todo el Excel.
                </p>
              </div>
            </div>

            <BrandButton className="h-9 px-3" onClick={() => setCreateModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Agregar producto manual
            </BrandButton>

            {createManualProduct.isError && (
              <p className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {getErrorMessage(createManualProduct.error)}
              </p>
            )}
            {createManualProduct.isSuccess && (
              <p className="flex items-center gap-1 text-xs text-[#1E9B50]">
                <Check className="h-3 w-3" />
                Producto agregado correctamente.
              </p>
            )}
          </PanelBody>
        </Panel>
      </div>

      {/* Listado de productos */}
      <Panel>
        <PanelHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PanelTitle className="">
            Productos de {company?.name}
            <span className="ml-2 text-sm font-normal text-[#6B7280]">
              {products.length}
            </span>
          </PanelTitle>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            <input className="brand-input h-10 rounded-xl pl-9 pr-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              placeholder="Buscar producto..."
              
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </PanelHeader>
        <PanelBody className="px-0">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-[#6B7280]">
              Cargando inventario...
            </p>
          ) : products.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto h-10 w-10 text-[#6B7280]/40" />
              <p className="mt-3 text-sm text-[#6B7280]">
                No hay productos en {company?.name}.
              </p>
              <p className="text-xs text-[#6B7280]">
                Carga la plantilla de Excel para cargar el inventario.
              </p>
            </div>
          ) : (
            <ResponsiveTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-left text-xs uppercase tracking-wide text-[#6B7280]">
                    <th className="px-6 py-2 font-medium">Referencia</th>
                    <th className="px-6 py-2 font-medium">Producto</th>
                    <th className="px-6 py-2 text-right font-medium">Stock</th>
                    <th className="px-6 py-2 text-right font-medium">Estado</th>
                    <th className="px-6 py-2 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((p) => (
                    <StockRow
                      key={p.id}
                      product={p}
                      onEdit={openEditProduct}
                      onSave={(stock) =>
                        updateStock.mutate({ companyId, id: p.id, stock })
                      }
                      saving={updateStock.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </PanelBody>
        {/* Controles de paginación (50 productos por página) */}
        {!isLoading && sortedProducts.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] px-6 py-3 text-sm">
            <span className="text-[#6B7280]">
              Mostrando {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, sortedProducts.length)} de{' '}
              {sortedProducts.length}
            </span>
            <div className="flex items-center gap-2">
              <BrandButton variant="outlined" className="h-9 px-3" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </BrandButton>
              <span className="text-[#6B7280]">
                Página {page} de {totalPages}
              </span>
              <BrandButton variant="outlined" className="h-9 px-3" disabled={page>= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </BrandButton>
            </div>
          </div>
        )}
      </Panel>

      {/* Modal de confirmación del cargue */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--warning,#f59e0b)]/10">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">Confirmar cargue de inventario</h3>
                {effectiveType === 'subproducto' ? (
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Elige qué estás cargando. El cargue{' '}
                    <strong className="text-[#111827]">
                      reemplaza solo esa especie
                    </strong>{' '}
                    (Bovino o Porcino) en{' '}
                    <strong className="text-[#111827]">{company?.name}</strong>;
                    la otra especie no se toca.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Este es un <strong className="text-[#111827]">cargue nuevo</strong>{' '}
                    que <strong className="text-[#111827]">reemplaza por completo</strong>{' '}
                    el inventario de{' '}
                    <strong className="text-[#111827]">{company?.name}</strong>.{' '}
                    <strong className="text-amber-600 dark:text-amber-500">
                      No se suma
                    </strong>{' '}
                    al stock actual.
                  </p>
                )}
              </div>
            </div>

            {effectiveType === 'subproducto' && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">¿Qué estás cargando?</p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: 'RES', label: 'Bovino (Res)' },
                      { key: 'CERDO', label: 'Porcino (Cerdo)' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPendingSpecies(opt.key)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                        pendingSpecies === opt.key
                          ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                          : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-[#E2E8F0] bg-[#F4FAF6] p-3 text-sm">
              <p className="flex items-center gap-2">
                <Upload className="h-4 w-4 shrink-0 text-[#6B7280]" />
                <span className="truncate font-medium">{pendingFile.name}</span>
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <BrandButton variant="outlined" className="h-10" onClick={() => {
                  setPendingFile(null);
                  setPendingSpecies(null);
                }}
                disabled={importInventory.isPending}
              >
                Cancelar
              </BrandButton>
              <BrandButton className="h-10" onClick={confirmImport} disabled={ importInventory.isPending || (effectiveType === 'subproducto' && !pendingSpecies) }>
                {importInventory.isPending
                  ? 'Cargando...'
                  : effectiveType === 'subproducto'
                    ? 'Sí, cargar esta especie'
                    : 'Sí, reemplazar inventario'}
              </BrandButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal de creación manual */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Agregar producto manual</h3>
            <p className="mt-1 text-sm text-[#6B7280]">
              Crear en inventario <strong className="text-[#111827]">{effectiveType}</strong> sin recargar todo el Excel.
            </p>

            <div className="mt-4 grid gap-3">
              <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                placeholder="Referencia (SKU)"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value.toUpperCase())}
            />
              <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                placeholder="Nombre del producto"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
            />
              <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                type="number"
                min={0}
                step="0.01"
                placeholder="Stock"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
            />
            </div>

            {createManualProduct.isError && (
              <p className="mt-3 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {getErrorMessage(createManualProduct.error)}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <BrandButton variant="outlined" className="h-10" onClick={() => setCreateModalOpen(false)}
                disabled={createManualProduct.isPending}
              >
                Cancelar
              </BrandButton>
              <BrandButton className="h-10" onClick={createProductManually} disabled={createManualProduct.isPending}>
                <Save className="h-4 w-4" />
                {createManualProduct.isPending ? 'Guardando...' : `Agregar a ${effectiveType}`}
              </BrandButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edición individual */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Editar producto</h3>
            <p className="mt-1 text-sm text-[#6B7280]">
              Referencia: <span className="font-mono">{editingProduct.sku}</span>
            </p>

            <div className="mt-4 grid gap-3">
              <div>
                <p className="mb-1 text-xs text-[#6B7280]">Nombre</p>
                <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
            />
              </div>
              <div>
                <p className="mb-1 text-xs text-[#6B7280]">Stock</p>
                <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                  type="number"
                  min={0}
                  step="0.01"
                  value={editStock}
                  onChange={(e) => setEditStock(e.target.value)}
            />
              </div>
            </div>

            {updateManualProduct.isError && (
              <p className="mt-3 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {getErrorMessage(updateManualProduct.error)}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <BrandButton variant="outlined" className="h-10" onClick={() => setEditingProduct(null)}
                disabled={updateManualProduct.isPending}
              >
                Cancelar
              </BrandButton>
              <BrandButton className="h-10" onClick={saveManualEdit} disabled={updateManualProduct.isPending}>
                {updateManualProduct.isPending ? 'Guardando...' : 'Guardar cambios'}
              </BrandButton>
            </div>
          </div>
        </div>
      )}
    </PageBackground>
  );
}

interface StockRowProps {
  product: Product;
  onEdit: (product: Product) => void;
  onSave: (stock: number) => void;
  saving: boolean;
}

function StockRow({ product, onEdit, onSave, saving }: StockRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(product.stock));

  function save() {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && parsed !== Number(product.stock)) {
      onSave(parsed);
    }
    setEditing(false);
  }

  return (
    <tr className="border-b border-[#E2E8F0]/80 last:border-0 hover:bg-[#F4FAF6]">
      <td className="px-6 py-3 font-mono text-xs text-[#6B7280]">
        {product.sku}
      </td>
      <td className="px-6 py-3 font-medium">{product.name}</td>
      <td className="px-6 py-3 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <input className="brand-input h-8 rounded-xl px-3 text-sm font-semibold outline-none w-24 text-right" style={FIELD_STYLE}
              type="number"
              autoFocus
              
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') {
                  setValue(String(product.stock));
                  setEditing(false);
                }
              }}
            />
            <BrandButton variant="text" className="h-9 w-9 px-0 h-8 w-8" disabled={saving} onClick={save}>
              <Check className="h-4 w-4 text-[#1E9B50]" />
            </BrandButton>
            <BrandButton variant="text" className="h-9 w-9 px-0 h-8 w-8" onClick={() => {
                setValue(String(product.stock));
                setEditing(false);
              }}
            >
              <X className="h-4 w-4 text-[#6B7280]" />
            </BrandButton>
          </div>
        ) : (
          <button
            className="group inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-[#F4FAF6]"
            onClick={() => setEditing(true)}
          >
            <span className="font-medium">{Number(product.stock)}</span>
            <Pencil className="h-3 w-3 text-[#6B7280] opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </td>
      <td className="px-6 py-3 text-right">
        <StatusPill
          label={product.active ? 'Activo' : 'Inactivo'}
          color={product.active ? BRAND.primary : BRAND.textMuted}
        />
      </td>
      <td className="px-6 py-3 text-right">
        <BrandButton variant="outlined" className="h-9 px-3 h-8" onClick={() => onEdit(product)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </BrandButton>
      </td>
    </tr>
  );
}
