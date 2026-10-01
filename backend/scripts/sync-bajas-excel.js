// Script puntual: sincroniza la tabla "baja" con una versión actualizada del
// Excel "INFORME DE BAJAS 2026-.xlsx" (hoja DATOS). A diferencia de
// import-bajas-excel.js (que solo inserta si la compañía no tiene registros),
// este script compara fila por fila y SOLO inserta las que falten en la BD,
// identificando cada fila por la combinación fecha+cod+numero+kilos+costo.
//
// Uso (desde backend/):
//   node scripts/sync-bajas-excel.js "C:\PROYECTOS\SIGCOM\INFORME DE BAJAS 2026-.xlsx" 3
require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { Client } = require('pg');

const filePath = process.argv[2];
const companyId = process.argv[3];

if (!filePath || !companyId) {
  console.error(
    'Uso: node scripts/sync-bajas-excel.js <ruta-del-excel> <company_id>',
  );
  process.exit(1);
}

function toIsoDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function rowKey(r) {
  return [r.fecha, r.cod, r.numero, r.kilos.toFixed(3), r.costo.toFixed(2)].join('|');
}

(async () => {
  const workbook = XLSX.readFile(path.resolve(filePath), { cellDates: true });
  const sheet = workbook.Sheets['DATOS'];
  if (!sheet) {
    console.error('No se encontró la hoja "DATOS" en el Excel.');
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
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
      'SELECT fecha, cod, numero, kilos, costo FROM baja WHERE company_id = $1',
      [companyId],
    );
    console.log(`Registros actuales en BD para la compañía ${companyId}: ${existing.length}`);

    const existingKeys = new Set(
      existing.map((r) =>
        [
          r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : r.fecha,
          String(r.cod ?? '').trim(),
          String(r.numero ?? '').trim(),
          Number(r.kilos).toFixed(3),
          Number(r.costo).toFixed(2),
        ].join('|'),
      ),
    );

    const missing = records.filter((r) => !existingKeys.has(rowKey(r)));
    console.log(`Registros faltantes detectados: ${missing.length}`);
    if (missing.length === 0) {
      console.log('No hay nada que insertar, la BD ya está al día.');
      return;
    }

    for (const r of missing) {
      console.log(
        `  + ${r.fecha} | ${r.cod} | ${r.producto} | ${r.tipoDocumento} | ${r.numero} | ${r.kilos} kg`,
      );
    }

    await client.query('BEGIN');
    for (const r of missing) {
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
    console.log(`Insertados ${missing.length} registros nuevos de bajas para la compañía ${companyId}.`);
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
