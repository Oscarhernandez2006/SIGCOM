// Script puntual: carga masiva (una sola vez) de los registros reales del
// Excel "INFORME DE BAJAS 2026-.xlsx" (hoja DATOS, filas 2-332) a la tabla
// "baja", para la compañía indicada. Usa la librería "xlsx" (ya presente en
// node_modules) para leer el archivo y "pg" para insertar.
//
// Es idempotente a nivel de compañía: si ya existen registros de bajas para
// la compañía indicada, no inserta de nuevo (evita duplicados por reintentos).
//
// Uso (desde backend/):
//   node scripts/import-bajas-excel.js "C:\PROYECTOS\SIGCOM\INFORME DE BAJAS 2026-.xlsx" 3
require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { Client } = require('pg');

const filePath = process.argv[2];
const companyId = process.argv[3];

if (!filePath || !companyId) {
  console.error(
    'Uso: node scripts/import-bajas-excel.js <ruta-del-excel> <company_id>',
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
  const sheet = workbook.Sheets['DATOS'];
  if (!sheet) {
    console.error('No se encontró la hoja "DATOS" en el Excel.');
    process.exit(1);
  }

  // header:1 => filas como arreglos; índice 1=col B ... 11=col L.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    // Fin de los datos reales: la hoja tiene miles de filas de relleno de un
    // caché de tabla dinámica (con valores como mes=1, producto=0) después de
    // los datos reales; la fecha (col C) es el único campo confiable que
    // distingue una fila real (siempre tiene fecha) de una de relleno.
    if (!(r[2] instanceof Date)) {
      break;
    }
    const cod = r[3];
    const producto = r[4];
    records.push({
      mes: Number(r[1]),
      fecha: toIsoDate(r[2]),
      cod: String(cod ?? '').trim(),
      producto: String(producto ?? '').trim(),
      tipoDocumento: String(r[5] ?? '').trim(),
      numero: String(r[6] ?? '').trim(),
      kilos: Number(r[7]) || 0,
      costoUnitario: Number(r[8]) || 0,
      costo: Number(r[9]) || 0,
      perdida: r[10] === undefined || r[10] === null || r[10] === '' ? null : Number(r[10]),
      causal: r[11] === undefined || r[11] === null || r[11] === '' ? null : String(r[11]).trim(),
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
      'SELECT COUNT(*)::int AS n FROM baja WHERE company_id = $1',
      [companyId],
    );
    if (existing[0].n > 0) {
      console.log(
        `La compañía ${companyId} ya tiene ${existing[0].n} registros en "baja". No se insertó nada (evita duplicados).`,
      );
      return;
    }

    await client.query('BEGIN');
    for (const r of records) {
      await client.query(
        `INSERT INTO baja
          (company_id, mes, fecha, cod, producto, tipo_documento, numero,
           kilos, costo_unitario, costo, perdida, causal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          companyId,
          r.mes,
          r.fecha,
          r.cod,
          r.producto,
          r.tipoDocumento,
          r.numero,
          r.kilos,
          r.costoUnitario,
          r.costo,
          r.perdida,
          r.causal,
        ],
      );
    }
    await client.query('COMMIT');
    console.log(`Insertados ${records.length} registros de bajas para la compañía ${companyId}.`);
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
