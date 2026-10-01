// Script puntual de migración: crea la tabla "baja" (Informe de bajas),
// réplica de la hoja DATOS del Excel de bajas/mermas, para digitación manual.
//
// Necesario porque en producción DB_SYNCHRONIZE=false, así que TypeORM no crea
// la tabla solo. Es idempotente: usa "IF NOT EXISTS".
//
// Uso (desde backend/):  node scripts/add-bajas-table.js
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS baja (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        company_id varchar NOT NULL,
        mes int NOT NULL,
        fecha date NOT NULL,
        cod varchar NOT NULL,
        producto varchar NOT NULL,
        tipo_documento varchar NOT NULL,
        numero varchar NOT NULL,
        kilos numeric(14,3) NOT NULL,
        costo_unitario numeric(14,2) NOT NULL,
        costo numeric(14,2) NOT NULL,
        perdida numeric(14,2),
        causal varchar
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_baja_company_id ON baja (company_id)
    `);

    console.log('Tabla baja creada (o ya existía).');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
