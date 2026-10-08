// Script puntual de migración: agrega las columnas de asociación de pedidos
// (linked_order_id / linked_order_number / linked_second_number) a la tabla
// orders. Permite marcar un segundo pedido del mismo cliente (mismo día)
// como complemento de uno anterior (p. ej. cuando un producto faltó por
// inventario rotativo y se sube en un pedido aparte más tarde).
// Necesario porque en producción DB_SYNCHRONIZE=false, así que TypeORM no crea
// las columnas solo. Es idempotente: usa "IF NOT EXISTS".
//
// Uso (desde backend/):  node scripts/add-order-link.js
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
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS linked_order_id uuid`,
    );
    await client.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS linked_order_number varchar`,
    );
    await client.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS linked_second_number varchar`,
    );
    console.log('Columnas linked_order_id / linked_order_number / linked_second_number agregadas a orders (o ya existían).');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
