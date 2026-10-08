// Script puntual de migración: columnas de auditoría de contraseña en users
// (password_changed_at / password_changed_by) para saber quién la cambió
// (usuario, admin o suite). Idempotente.
//
// Uso (desde backend/):  node scripts/add-password-audit.js
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
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz`,
    );
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_by varchar`,
    );
    console.log('Columnas password_changed_at / password_changed_by agregadas a users (o ya existían).');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
