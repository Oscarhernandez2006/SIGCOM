/*
 * Agrega a client_records las columnas del cupo de crédito por sucursal que
 * ahora devuelve la consulta de cartera de Siesa (idempotente).
 */
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
    const columns = [
      'credit_limit numeric(16,2)',
      'credit_balance numeric(16,2)',
      'credit_available numeric(16,2)',
      'credit_blocked boolean',
      'credit_tolerance_pct numeric(7,2)',
      'credit_grace_days integer',
      'credit_date date',
      'credit_updated_at timestamptz',
    ];
    for (const col of columns) {
      await client.query(
        `ALTER TABLE client_records ADD COLUMN IF NOT EXISTS ${col}`,
      );
    }
    console.log('OK: columnas de cupo de crédito listas en client_records.');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
