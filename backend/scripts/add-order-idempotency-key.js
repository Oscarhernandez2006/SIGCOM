// Script puntual de migración: agrega la columna idempotency_key a la tabla
// orders, con índice único por compañía. Evita pedidos duplicados cuando el
// vendedor reintenta crear el mismo pedido tras una conexión lenta/inestable
// (el frontend reenvía la misma clave y el backend devuelve el pedido ya
// creado en vez de duplicarlo).
// Necesario porque en producción DB_SYNCHRONIZE=false, así que TypeORM no crea
// las columnas solo. Es idempotente: usa "IF NOT EXISTS".
//
// Uso (desde backend/):  node scripts/add-order-idempotency-key.js
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
    await client.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key varchar`,
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_company_idempotency_key
       ON orders (company_id, idempotency_key)
       WHERE idempotency_key IS NOT NULL`,
    );
    console.log('Columna idempotency_key (+ índice único) agregada a orders (o ya existía).');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
