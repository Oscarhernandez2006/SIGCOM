import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

/**
 * Tarjeta blanca de marca con cabecera/título/cuerpo, pensada para migrar
 * páginas que usaban `Card/CardHeader/CardTitle/CardContent` de shadcn sin
 * reescribir su contenido.
 */
export function Panel({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <section
      className={cn('rounded-2xl bg-white', className)}
      style={{ border: `1px solid ${BRAND.border}CC`, color: BRAND.text }}
    >
      {children}
    </section>
  );
}

export function PanelHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-1 px-4 pt-4 pb-2 sm:px-[18px]', className)}>{children}</div>;
}

export function PanelTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-[15px] font-extrabold tracking-[-0.2px]', className)}>{children}</h3>;
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 pb-4 sm:px-[18px]', className)}>{children}</div>;
}
