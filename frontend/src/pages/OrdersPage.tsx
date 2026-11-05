import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban,
  CloudOff,
  Copy,
  Download,
  Inbox,
  Loader2,
  Pencil,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import {
  useOrders,
  useCancelOrder,
  useSiesaStates,
  useClients,
  downloadOrderPdf,
} from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { useCompany } from '@/company/useCompany';
import { BRAND } from '@/lib/brand';
import { firstOfMonthISO, todayISO } from '@/lib/format';
import { EditOrderModal } from '@/components/EditOrderModal';
import { DuplicateOrderModal } from '@/components/DuplicateOrderModal';
import { EmptyMessage, Hero, PageBackground } from '@/components/brand/PageShell';
import { RangeChip } from '@/components/brand/RangeChip';
import { FadeIn } from '@/components/dashboard/primitives';
import { CardAction, OrderCard } from '@/components/orders/OrderCard';
import { GroupFilter } from '@/components/orders/GroupFilter';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { CancelOrderModal } from '@/components/orders/CancelOrderModal';
import { OrderTypeModal } from '@/components/orders/OrderTypeModal';
import { groupOf, summarizeGroups, type OrderGroup } from '@/components/orders/order-status';
import type { Order, Client } from '@/types';

/** Lista de pedidos del vendedor (OrdersScreen en la app). */
export function OrdersPage() {
  // Por defecto se filtra el mes en curso para no cargar todo el histórico.
  const [fromDate, setFromDate] = useState(firstOfMonthISO());
  const [toDate, setToDate] = useState(todayISO());
  const [group, setGroup] = useState<OrderGroup | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [customerFilter, setCustomerFilter] = useState<Client | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(id);
  }, [search]);

  const {
    data: orders = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useOrders({
    from: fromDate || undefined,
    to: toDate || undefined,
    customerId: customerFilter?.id,
  });
  // Sugerencias de cliente para filtrar por un cliente específico de la cartera.
  const { data: clientResults = [] } = useClients(debounced);
  const { data: siesaStates = {} } = useSiesaStates();
  const cancelMutation = useCancelOrder();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company } = useCompany();
  const isSeller = user?.role === 'seller';

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<Order | null>(null);
  const [editTarget, setEditTarget] = useState<Order | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelError, setCancelError] = useState('');
  const [showTypeModal, setShowTypeModal] = useState(false);

  // Los totales por grupo se calculan sobre el periodo completo (sin el filtro de grupo).
  const summary = useMemo(() => (isLoading ? null : summarizeGroups(orders)), [orders, isLoading]);

  const visible = useMemo(() => {
    const q = debounced.toLowerCase();
    return orders.filter((o) => {
      if (group && groupOf(o.status) !== group) return false;
      if (!q || customerFilter) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        (o.secondNumber ?? '').toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.code.toLowerCase().includes(q)
      );
    });
  }, [orders, group, debounced, customerFilter]);

  // Mientras hay texto de búsqueda (y aún no se eligió un cliente) se sugieren
  // clientes de la cartera para filtrar exactamente por uno.
  const showSuggestions = !customerFilter && debounced.length >= 2 && clientResults.length > 0;

  const handleDownload = async (order: Order) => {
    setDownloadingId(order.id);
    try {
      await downloadOrderPdf(order.id, order.orderNumber);
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmCancel = async (reason: string) => {
    if (!cancelTarget) return;
    try {
      await cancelMutation.mutateAsync({ orderId: cancelTarget.id, reason });
      setCancelTarget(null);
      setCancelError('');
      setDetailTarget(null);
    } catch {
      setCancelError('No se pudo anular el pedido. Intenta de nuevo.');
    }
  };

  const canCancel = (o: Order) => o.status !== 'cancelled' && o.status !== 'synced';
  const canEdit = (o: Order) => o.status === 'confirmed' || o.status === 'failed';
  const canDuplicate = (o: Order) => o.status === 'failed' || o.status === 'bounced';

  return (
    <PageBackground className="space-y-3.5 pb-24">
      <Hero>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
            {isSeller ? 'Mis pedidos' : 'Pedidos'}
          </h2>
          {isFetching && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <RangeChip
            from={fromDate}
            to={toDate}
            onChange={(f, t) => {
              setFromDate(f);
              setToDate(t);
            }}
          />
          <div className="relative w-full flex-1 sm:w-auto sm:min-w-[220px]">
            {customerFilter ? (
              <div
                className="flex h-11 items-center gap-2 rounded-[14px] bg-white px-3 text-sm font-semibold"
                style={{ color: BRAND.text }}
              >
                <Search className="h-[18px] w-[18px] shrink-0" style={{ color: BRAND.textSoft }} />
                <span className="min-w-0 flex-1 truncate">
                  {customerFilter.name}{' '}
                  <span className="font-normal" style={{ color: BRAND.textSoft }}>
                    · NIT {customerFilter.code}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Quitar filtro de cliente"
                  onClick={() => {
                    setCustomerFilter(null);
                    setSearch('');
                  }}
                  className="shrink-0 rounded-full p-1 hover:bg-[#F4FAF6]"
                  style={{ color: BRAND.textMuted }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 z-[1] h-[18px] w-[18px] -translate-y-1/2"
                  style={{ color: BRAND.textSoft }}
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cliente, NIT o # pedido"
                  className="h-11 w-full rounded-[14px] bg-white pl-10 pr-3 text-sm font-medium outline-none"
                  style={{ color: BRAND.text }}
                />
                {showSuggestions && (
                  <div
                    className="absolute left-0 right-0 z-20 mt-1.5 max-h-64 overflow-auto rounded-2xl bg-white p-1 shadow-xl"
                    style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
                  >
                    <p
                      className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide"
                      style={{ color: BRAND.textSoft }}
                    >
                      Filtrar por cliente
                    </p>
                    {clientResults.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomerFilter(c);
                          setSearch('');
                        }}
                        className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left text-sm hover:bg-[#F4FAF6]"
                      >
                        <span className="font-bold">{c.name}</span>
                        <span className="text-xs" style={{ color: BRAND.textSoft }}>
                          NIT {c.code}
                          {c.branchName || c.branch ? ` · ${c.branchName || c.branch}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Hero>

      <GroupFilter summary={summary} selected={group} onSelect={setGroup} loading={isFetching} />

      {isError && (
        <EmptyMessage
          icon={CloudOff}
          text={error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.'}
          onRetry={() => refetch()}
        />
      )}

      {isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[132px] animate-pulse rounded-[20px] bg-white"
              style={{ border: `1px solid ${BRAND.border}CC` }}
            />
          ))}
        </div>
      ) : !isError && visible.length === 0 ? (
        <EmptyMessage icon={Inbox} text="No hay pedidos con estos filtros." />
      ) : (
        <div className="grid gap-2.5 xl:grid-cols-2">
          {visible.map((order, i) => (
            <FadeIn key={order.id} index={Math.min(i, 12)}>
              <OrderCard
                order={order}
                siesa={siesaStates[order.orderNumber]}
                showSeller={!isSeller}
                dimmed={isFetching}
                onOpen={() => setDetailTarget(order)}
                actions={
                  <>
                    {canEdit(order) && (
                      <CardAction icon={Pencil} label="Editar" onClick={() => setEditTarget(order)} />
                    )}
                    {canDuplicate(order) && (
                      <CardAction icon={Copy} label="Duplicar" onClick={() => setDuplicateTarget(order)} />
                    )}
                    <CardAction
                      icon={Download}
                      label="Documento"
                      disabled={downloadingId === order.id}
                      onClick={() => handleDownload(order)}
                    />
                    {canCancel(order) && (
                      <span className="ml-auto">
                        <CardAction
                          icon={Ban}
                          label="Anular"
                          danger
                          onClick={() => {
                            setCancelError('');
                            setCancelTarget(order);
                          }}
                        />
                      </span>
                    )}
                  </>
                }
              />
            </FadeIn>
          ))}
        </div>
      )}

      {/* Botón flotante "Nuevo pedido" (FloatingActionButton en la app) */}
      <button
        type="button"
        onClick={() => setShowTypeModal(true)}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-2xl px-5 text-[15px] font-extrabold text-white transition-transform hover:scale-[1.03] active:scale-95 sm:bottom-6 sm:right-6"
        style={{
          backgroundColor: BRAND.primary,
          boxShadow: `0 10px 24px ${BRAND.primaryDark}66`,
        }}
      >
        <ShoppingCart className="h-5 w-5" />
        Nuevo pedido
      </button>

      {detailTarget && (
        <OrderDetailModal
          order={detailTarget}
          siesa={siesaStates[detailTarget.orderNumber]}
          onClose={() => setDetailTarget(null)}
          downloading={downloadingId === detailTarget.id}
          onDownload={() => handleDownload(detailTarget)}
          onEdit={canEdit(detailTarget) ? () => setEditTarget(detailTarget) : undefined}
          onDuplicate={canDuplicate(detailTarget) ? () => setDuplicateTarget(detailTarget) : undefined}
          onCancel={
            canCancel(detailTarget)
              ? () => {
                  setCancelError('');
                  setCancelTarget(detailTarget);
                }
              : undefined
          }
        />
      )}

      {editTarget && <EditOrderModal order={editTarget} onClose={() => setEditTarget(null)} />}

      {cancelTarget && (
        <CancelOrderModal
          order={cancelTarget}
          pending={cancelMutation.isPending}
          error={cancelError}
          onClose={() => setCancelTarget(null)}
          onConfirm={confirmCancel}
        />
      )}

      {showTypeModal && (
        <OrderTypeModal
          isAdmin={user?.role === 'admin'}
          permissions={company?.permissions ?? []}
          onClose={() => setShowTypeModal(false)}
          onSelect={(tipo) => {
            setShowTypeModal(false);
            navigate(`/pedidos/nuevo?tipo=${tipo}`);
          }}
        />
      )}

      {duplicateTarget && (
        <DuplicateOrderModal order={duplicateTarget} onClose={() => setDuplicateTarget(null)} />
      )}
    </PageBackground>
  );
}
