import * as XLSX from 'xlsx';
import { Baja } from './entities/baja.entity';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map((wch) => ({ wch }));
}

/** Genera el Excel del informe de bajas: hoja "Resumen" (dashboard) + hoja "Datos" (detalle). */
export function buildBajasReportExcel(bajas: Baja[]): Buffer {
  const wb = XLSX.utils.book_new();

  const totalKilos = bajas.reduce((acc, b) => acc + Number(b.kilos), 0);
  const totalCosto = bajas.reduce((acc, b) => acc + Number(b.costo), 0);
  const totalPerdida = bajas.reduce((acc, b) => acc + Number(b.perdida ?? 0), 0);

  const byMonth = new Map<number, number>();
  const byCausal = new Map<string, number>();
  const byProducto = new Map<string, number>();
  for (const b of bajas) {
    const kilos = Number(b.kilos);
    byMonth.set(b.mes, (byMonth.get(b.mes) ?? 0) + kilos);
    const causal = b.causal?.trim() || 'Sin causal';
    byCausal.set(causal, (byCausal.get(causal) ?? 0) + kilos);
    byProducto.set(b.producto, (byProducto.get(b.producto) ?? 0) + kilos);
  }
  const mesesOrdenados = [...byMonth.entries()].sort((a, b) => a[0] - b[0]);
  const causales = [...byCausal.entries()].sort((a, b) => b[1] - a[1]);
  const productos = [...byProducto.entries()].sort((a, b) => b[1] - a[1]);

  const resumenAoa: (string | number)[][] = [
    ['Informe de bajas - Resumen'],
    [],
    ['Total registros', bajas.length],
    ['Total kilos', totalKilos],
    ['Total costo', totalCosto],
    ['Total pérdida', totalPerdida],
    [],
    ['Bajas por mes (kg)'],
    ['Mes', 'Kilos'],
    ...mesesOrdenados.map(([m, k]) => [MONTHS[m - 1] ?? String(m), k]),
    [],
    ['Causales (kg)'],
    ['Causal', 'Kilos'],
    ...causales.map(([c, k]) => [c, k]),
    [],
    ['Productos (kg)'],
    ['Producto', 'Kilos'],
    ...productos.map(([p, k]) => [p, k]),
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenAoa);
  setColumnWidths(wsResumen, [40, 16]);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  const datosAoa: (string | number)[][] = [
    ['Mes', 'Fecha', 'Cód.', 'Producto', 'Tipo de documento', 'Número', 'Kilos', 'Costo unitario', 'Costo', 'Pérdida', 'Causal'],
  ];
  for (const b of bajas) {
    datosAoa.push([
      MONTHS[b.mes - 1] ?? String(b.mes),
      b.fecha,
      b.cod,
      b.producto,
      b.tipoDocumento,
      b.numero,
      Number(b.kilos),
      Number(b.costoUnitario),
      Number(b.costo),
      b.perdida != null ? Number(b.perdida) : '',
      b.causal ?? '',
    ]);
  }
  const wsDatos = XLSX.utils.aoa_to_sheet(datosAoa);
  setColumnWidths(wsDatos, [12, 12, 10, 36, 18, 14, 10, 14, 12, 12, 24]);
  XLSX.utils.book_append_sheet(wb, wsDatos, 'Datos');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
