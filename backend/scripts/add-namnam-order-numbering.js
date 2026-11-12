/*
 * Ñam Ñam lleva numeración propia por compañía: su número puede coincidir con
 * el de un corte. Se reemplaza el UNIQUE (company_id, order_number) por dos
 * índices únicos parciales que conservan exactamente la garantía anterior para
 * cortes/subproductos y agregan una aparte para Ñam Ñam (idempotente).
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
    await client.query('BEGIN');
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_company_number_main
         ON orders (company_id, order_number) WHERE type <> 'namnam'`,
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_company_number_namnam
         ON orders (company_id, order_number) WHERE type = 'namnam'`,
    );
    await client.query(
      'ALTER TABLE orders DROP CONSTRAINT IF EXISTS uq_order_company_number',
    );
    await client.query('COMMIT');
    console.log('OK: numeración de Ñam Ñam independiente en orders.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
