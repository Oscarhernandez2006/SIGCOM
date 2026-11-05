import { BRAND } from '@/lib/brand';
import { formatInt, formatMoneyShort } from '@/lib/format';
import { ORDER_GROUPS, type GroupTotals, type OrderGroup } from './order-status';

/** Fichas de filtro por grupo con conteo y total (_GroupFilter en la app). */
export function GroupFilter({
  summary,
  selected,
  onSelect,
  loading = false,
}: {
  summary: Record<OrderGroup, GroupTotals> | null;
  selected: OrderGroup | null;
  onSelect: (group: OrderGroup | null) => void;
  loading?: boolean;
}) {
  const all = summary
    ? Object.values(summary).reduce(
        (acc, g) => ({ count: acc.count + g.count, total: acc.total + g.total }),
        { count: 0, total: 0 },
      )
    : null;

  const tiles: { key: OrderGroup | null; label: string; color: string; totals: GroupTotals | null }[] = [
    { key: null, label: 'Todos', color: BRAND.text, totals: all },
    ...ORDER_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      color: g.color,
      totals: summary ? summary[g.key] : null,
    })),
  ];

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
      {tiles.map((t) => {
        const active = t.key === selected;
        return (
          <button
            key={t.key ?? 'all'}
            type="button"
            onClick={() => onSelect(t.key)}
            className="w-32 shrink-0 rounded-2xl p-3 text-left transition-colors lg:w-auto"
            style={{
              backgroundColor: active ? t.color : '#FFFFFF',
              border: `1px solid ${active ? t.color : BRAND.border}`,
              opacity: loading && !summary ? 0.7 : 1,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: active ? '#FFFFFF' : t.color }}
              />
              <span
                className="truncate text-xs font-bold"
                style={{ color: active ? '#FFFFFF' : BRAND.textMuted }}
              >
                {t.label}
              </span>
            </div>
            <p
              className="mt-1.5 text-xl font-extrabold leading-tight"
              style={{ color: active ? '#FFFFFF' : BRAND.text }}
            >
              {t.totals ? formatInt(t.totals.count) : '—'}
            </p>
            <p
              className="truncate text-xs"
              style={{ color: active ? 'rgba(255,255,255,0.7)' : BRAND.textSoft }}
            >
              {t.totals ? formatMoneyShort(t.totals.total) : '\u00A0'}
            </p>
          </button>
        );
      })}
    </div>
  );
}
