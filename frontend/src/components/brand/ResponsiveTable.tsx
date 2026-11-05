import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Envoltorio para tablas: en escritorio permite scroll horizontal; en móvil
 * (< 640px) cada fila se muestra como tarjeta "etiqueta · valor" usando el
 * texto de la cabecera (ver `.rt` en index.css). No altera la lógica de la
 * tabla: solo añade `data-label` a cada celda a partir del `<thead>`.
 */
export function ResponsiveTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const label = () => {
      root.querySelectorAll('table').forEach((table) => {
        const heads = Array.from(table.querySelectorAll(':scope > thead th')).map(
          (th) => th.textContent?.trim() ?? '',
        );
        table.querySelectorAll(':scope > tbody > tr, :scope > tfoot > tr').forEach((tr) => {
          let col = 0;
          Array.from(tr.children).forEach((cell) => {
            const td = cell as HTMLTableCellElement;
            const span = td.colSpan || 1;
            if (span > 1) {
              td.removeAttribute('data-label');
              td.setAttribute('data-span', '1');
            } else {
              td.removeAttribute('data-span');
              td.setAttribute('data-label', heads[col] ?? '');
            }
            col += span;
          });
        });
      });
    };

    label();
    const observer = new MutationObserver(label);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn('rt', className)}>
      {children}
    </div>
  );
}
