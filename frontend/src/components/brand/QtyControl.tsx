import { Minus, Plus } from 'lucide-react';
import { BRAND } from '@/lib/brand';

/** Control de cantidad: "Agregar" → [− n +] (QtyControl en la app). */
export function QtyControl({
  quantity,
  disabled,
  onAdd,
  onInc,
  onDec,
  onSet,
  onBlur,
}: {
  quantity: number;
  disabled?: boolean;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  onSet: (value: number) => void;
  onBlur: () => void;
}) {
  if (quantity <= 0 && !disabled) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-extrabold text-white hover:opacity-90"
        style={{ backgroundColor: BRAND.primary }}
      >
        <Plus className="h-4 w-4" />
        Agregar
      </button>
    );
  }
  if (disabled) {
    return (
      <span
        className="inline-flex h-9 shrink-0 items-center rounded-full px-3 text-xs font-bold"
        style={{ backgroundColor: BRAND.field, color: BRAND.textSoft }}
      >
        Agotado
      </span>
    );
  }
  return (
    <div
      className="flex h-9 shrink-0 items-center rounded-full"
      style={{ border: `1.5px solid ${BRAND.primary}` }}
    >
      <button
        type="button"
        aria-label="Quitar uno"
        onClick={onDec}
        className="flex h-full w-8 items-center justify-center rounded-l-full hover:bg-[#E8F5EC]"
        style={{ color: BRAND.primaryDark }}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        min={0}
        value={quantity}
        onChange={(e) => onSet(Number(e.target.value))}
        onBlur={onBlur}
        onFocus={(e) => e.currentTarget.select()}
        className="h-full w-11 bg-transparent text-center text-sm font-extrabold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ color: BRAND.text }}
      />
      <button
        type="button"
        aria-label="Agregar uno"
        onClick={onInc}
        className="flex h-full w-8 items-center justify-center rounded-r-full hover:bg-[#E8F5EC]"
        style={{ color: BRAND.primaryDark }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
