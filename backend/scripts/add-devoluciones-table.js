// Script puntual de migración: crea la tabla "devolucion" (Informe de
// devoluciones), réplica de la hoja DEVOLUCIONES del Excel de devoluciones
// diarias, para digitación manual.
//
// Necesario porque en producción DB_SYNCHRONIZE=false, así que TypeORM no crea
// la tabla solo. Es idempotente: usa "IF NOT EXISTS".
//
// Uso (desde backend/):  node scripts/add-devoluciones-table.js
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
      CREATE TABLE IF NOT EXISTS devolucion (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        company_id varchar NOT NULL,
        fecha date NOT NULL,
        vendedor varchar,
        factura_numero varchar,
        cod varchar NOT NULL,
        producto varchar NOT NULL,
        kilos numeric(14,3) NOT NULL,
        numero_documento varchar NOT NULL,
        nit varchar NOT NULL,
        cliente varchar NOT NULL,
        causa varchar NOT NULL,
        conductor varchar,
        precio numeric(14,2) NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_devolucion_company_id ON devolucion (company_id)
    `);

    console.log('Tabla devolucion creada (o ya existía).');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
