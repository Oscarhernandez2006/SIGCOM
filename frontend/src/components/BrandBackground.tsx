import type { ReactNode } from 'react';
import { BRAND } from '@/lib/brand';

/** Fondo degradado con manchas de color, igual que BrandBackground en la app. */
export function BrandBackground({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(135deg, #FFFFFF 0%, ${BRAND.background} 50%, #E8F5EC 100%)`,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-[120px] h-[280px] w-[280px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${BRAND.brandGreen}1F 0%, ${BRAND.brandGreen}00 70%)`,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[140px] -left-[100px] h-[320px] w-[320px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${BRAND.brandRed}0F 0%, ${BRAND.brandRed}00 70%)`,
        }}
      />
      <div className="relative flex min-h-full flex-1 flex-col">{children}</div>
    </div>
  );
}
