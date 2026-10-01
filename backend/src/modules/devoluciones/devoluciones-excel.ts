import * as XLSX from 'xlsx';
import { Devolucion } from './entities/devolucion.entity';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map((wch) => ({ wch }));
}

/** Genera el Excel del informe de devoluciones: hoja "Resumen" (dashboard) + hoja "Datos" (detalle). */
export function buildDevolucionesReportExcel(devoluciones: Devolucion[]): Buffer {
  const wb = XLSX.utils.book_new();

  const totalKilos = devoluciones.reduce((acc, d) => acc + Number(d.kilos), 0);
  const totalValor = devoluciones.reduce((acc, d) => acc + Number(d.precio), 0);
  const promedioKilos = devoluciones.length > 0 ? totalKilos / devoluciones.length : 0;

  const byMonth = new Map<number, number>();
  const byCausa = new Map<string, number>();
  const byProducto = new Map<string, number>();
  const byCliente = new Map<string, number>();
  for (const d of devoluciones) {
    const kilos = Number(d.kilos);
    const mes = Number(d.fecha.slice(5, 7));
    byMonth.set(mes, (byMonth.get(mes) ?? 0) + kilos);
    byCausa.set(d.causa, (byCausa.get(d.causa) ?? 0) + kilos);
    byProducto.set(d.producto, (byProducto.get(d.producto) ?? 0) + kilos);
    byCliente.set(d.cliente, (byCliente.get(d.cliente) ?? 0) + kilos);
  }
  const mesesOrdenados = [...byMonth.entries()].sort((a, b) => a[0] - b[0]);
  const causas = [...byCausa.entries()].sort((a, b) => b[1] - a[1]);
  const productos = [...byProducto.entries()].sort((a, b) => b[1] - a[1]);
  const clientes = [...byCliente.entries()].sort((a, b) => b[1] - a[1]);

  const resumenAoa: (string | number)[][] = [
    ['Informe de devoluciones - Resumen'],
    [],
    ['Total registros', devoluciones.length],
    ['Total devuelto (kg)', totalKilos],
    ['Valor total', totalValor],
    ['Promedio kg/devolución', promedioKilos],
    [],
    ['Devoluciones por mes (kg)'],
    ['Mes', 'Kilos'],
    ...mesesOrdenados.map(([m, k]) => [MONTHS[m - 1] ?? String(m), k]),
    [],
    ['Causas de devolución (kg)'],
    ['Causa', 'Kilos'],
    ...causas.map(([c, k]) => [c, k]),
    [],
    ['Productos devueltos (kg)'],
    ['Producto', 'Kilos'],
    ...productos.map(([p, k]) => [p, k]),
    [],
    ['Clientes con devoluciones (kg)'],
    ['Cliente', 'Kilos'],
    ...clientes.map(([c, k]) => [c, k]),
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenAoa);
  setColumnWidths(wsResumen, [40, 16]);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  const datosAoa: (string | number)[][] = [
    ['Fecha', 'Vendedor', 'N° Factura', 'Cód.', 'Producto', 'Kilos', 'N° Documento', 'NIT', 'Cliente', 'Causa', 'Conductor', 'Precio'],
  ];
  for (const d of devoluciones) {
    datosAoa.push([
      d.fecha,
      d.vendedor ?? '',
      d.facturaNumero ?? '',
      d.cod,
      d.producto,
      Number(d.kilos),
      d.numeroDocumento,
      d.nit,
      d.cliente,
      d.causa,
      d.conductor ?? '',
      Number(d.precio),
    ]);
  }
  const wsDatos = XLSX.utils.aoa_to_sheet(datosAoa);
  setColumnWidths(wsDatos, [12, 24, 12, 10, 36, 10, 16, 14, 30, 24, 20, 14]);
  XLSX.utils.book_append_sheet(wb, wsDatos, 'Datos');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
