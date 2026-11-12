/*
 * Crea la tabla de certificados de referencia comercial emitidos (idempotente).
 * Cada certificado guarda los datos verificados en Siesa y el PDF generado
 * como soporte de la certificación expedida.
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS commercial_certificates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        company_id varchar NOT NULL,
        number integer NOT NULL,
        client_code varchar NOT NULL,
        client_name varchar NOT NULL,
        date_from date NOT NULL,
        date_to date NOT NULL,
        addressed_to varchar NOT NULL,
        notes text,
        issued_by_id uuid,
        issued_by_name varchar NOT NULL,
        data jsonb NOT NULL,
        pdf bytea NOT NULL,
        CONSTRAINT uq_certificate_company_number UNIQUE (company_id, number)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_certificate_company_client
         ON commercial_certificates (company_id, client_code)`,
    );
    console.log('OK: tabla commercial_certificates lista.');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
