// Script puntual: carga masiva (una sola vez) de los registros reales del
// Excel "DEVOLUCIONES DIARIAS 2026 ORIG...xlsx" (hoja "DEVOLUCIONES ", con
// espacio al final) a la tabla "devolucion", para la compañía indicada.
//
// Es idempotente a nivel de compañía: si ya existen registros de devoluciones
// para la compañía indicada, no inserta de nuevo (evita duplicados).
//
// Uso (desde backend/):
//   node scripts/import-devoluciones-excel.js "C:\PROYECTOS\SIGCOM\DEVOLUCIONES DIARIAS 2026 ORIG...xlsx" 3
require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { Client } = require('pg');

const filePath = process.argv[2];
const companyId = process.argv[3];

if (!filePath || !companyId) {
  console.error(
    'Uso: node scripts/import-devoluciones-excel.js <ruta-del-excel> <company_id>',
  );
  process.exit(1);
}

/** Formatea un Date (parseado por xlsx en UTC) a "YYYY-MM-DD". */
function toIsoDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

(async () => {
  const workbook = XLSX.readFile(path.resolve(filePath), { cellDates: true });
  const sheet = workbook.Sheets['DEVOLUCIONES '];
  if (!sheet) {
    console.error('No se encontró la hoja "DEVOLUCIONES " en el Excel.');
    process.exit(1);
  }

  // header:1 => filas como arreglos; fila 0 vacía, fila 1 encabezados, datos
  // desde la fila 2: FECHA, VENDEDOR, N° FACTURA, CODIGO, PRODUCTO,
  // UNIDADES - KILOS, NO DEL DOCUMENTO, NIT, Cliente, CAUSA DE LA DEVOLUCION,
  // CONDUCTOR, PRECIO.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const records = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] || [];
    // Fin de los datos reales: la hoja tiene filas vacías de relleno después
    // de los datos reales; la fecha (col A) es el campo confiable que
    // distingue una fila real (siempre tiene fecha) de una de relleno.
    if (!(r[0] instanceof Date)) {
      break;
    }
    const vendedor = r[1];
    const facturaNumero = r[2];
    const conductor = r[10];
    records.push({
      fecha: toIsoDate(r[0]),
      vendedor: vendedor === undefined || vendedor === null || vendedor === '' ? null : String(vendedor).trim(),
      facturaNumero:
        facturaNumero === undefined || facturaNumero === null || facturaNumero === ''
          ? null
          : String(facturaNumero).trim(),
      cod: String(r[3] ?? '').trim(),
      producto: String(r[4] ?? '').trim(),
      kilos: Number(r[5]) || 0,
      numeroDocumento: String(r[6] ?? '').trim(),
      nit: String(r[7] ?? '').trim(),
      cliente: String(r[8] ?? '').trim(),
      causa: String(r[9] ?? '').trim(),
      conductor: conductor === undefined || conductor === null || conductor === '' ? null : String(conductor).trim(),
      precio: Number(r[11]) || 0,
    });
  }

  console.log(`Filas de datos encontradas en el Excel: ${records.length}`);

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();

  try {
    const { rows: existing } = await client.query(
      'SELECT COUNT(*)::int AS n FROM devolucion WHERE company_id = $1',
      [companyId],
    );
    if (existing[0].n > 0) {
      console.log(
        `La compañía ${companyId} ya tiene ${existing[0].n} registros en "devolucion". No se insertó nada (evita duplicados).`,
      );
      return;
    }

    await client.query('BEGIN');
    for (const r of records) {
      await client.query(
        `INSERT INTO devolucion
          (company_id, fecha, vendedor, factura_numero, cod, producto, kilos,
           numero_documento, nit, cliente, causa, conductor, precio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          companyId,
          r.fecha,
          r.vendedor,
          r.facturaNumero,
          r.cod,
          r.producto,
          r.kilos,
          r.numeroDocumento,
          r.nit,
          r.cliente,
          r.causa,
          r.conductor,
          r.precio,
        ],
      );
    }
    await client.query('COMMIT');
    console.log(`Insertados ${records.length} registros de devoluciones para la compañía ${companyId}.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
