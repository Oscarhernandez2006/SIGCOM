// Exporta a Excel la base de clientes de los vendedores indicados (por su
// cédula/documento), una hoja por vendedor, con toda la info del cliente,
// su cartera (consultada en vivo a Siesa) y si está atendido (tiene pedidos
// creados en la plataforma) o no.
require('dotenv').config();
const { Client } = require('pg');
const axios = require('axios');
const XLSX = require('xlsx');
const path = require('path');

const SELLER_DOCUMENT_IDS = ['1001996931', '1044211937'];

const PRICE_LISTS_BASE_URL =
  process.env.PRICE_LISTS_BASE_URL ?? 'https://apiconsulta.grupo-santacruz.com';
const PRICE_LISTS_TOKEN = process.env.PRICE_LISTS_TOKEN ?? '';

/** Consulta la cartera de un cliente (mismo endpoint que usa el backend). */
async function fetchPortfolio(companyId, nit) {
  try {
    const { data } = await axios.get(`${PRICE_LISTS_BASE_URL}/cartera`, {
      params: { cia: companyId, nit, token: PRICE_LISTS_TOKEN },
      timeout: 30000,
    });
    const rows = data?.data ?? [];
    const totalBalance = rows.reduce((sum, r) => sum + (Number(r.SALDO) || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const overdueBalance = rows.reduce((sum, r) => {
      const saldo = Number(r.SALDO) || 0;
      const vcto = (r.FECHA_VCTO ?? '').slice(0, 10);
      return saldo > 0 && vcto && vcto < today ? sum + saldo : sum;
    }, 0);
    return {
      totalBalance: Number(totalBalance.toFixed(2)),
      overdueBalance: Number(overdueBalance.toFixed(2)),
      docsCount: rows.length,
    };
  } catch (err) {
    return { totalBalance: null, overdueBalance: null, docsCount: null, error: true };
  }
}

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();

  const wb = XLSX.utils.book_new();

  try {
    for (const documentId of SELLER_DOCUMENT_IDS) {
      console.log(`\n=== Vendedor ${documentId} ===`);
      const userRes = await client.query(
        `SELECT id, name, document_id, siesa_seller_code FROM users WHERE document_id = $1`,
        [documentId],
      );
      if (userRes.rowCount === 0) {
        console.log('  ⚠ No se encontró usuario con esa cédula.');
        const ws = XLSX.utils.aoa_to_sheet([
          ['No se encontró ningún usuario con la cédula ' + documentId],
        ]);
        XLSX.utils.book_append_sheet(wb, ws, documentId.slice(0, 31));
        continue;
      }
      const user = userRes.rows[0];
      console.log(`  Usuario: ${user.name} (id ${user.id})`);

      const mapsRes = await client.query(
        `SELECT company_id, siesa_seller_code FROM user_companies WHERE user_id = $1 AND active = true`,
        [user.id],
      );

      // Código efectivo por compañía (el de user_companies manda; si no, el global).
      const perCompany = mapsRes.rows
        .map((m) => ({
          companyId: m.company_id,
          sellerCode: (m.siesa_seller_code || user.siesa_seller_code || '').trim(),
        }))
        .filter((m) => m.sellerCode);

      if (perCompany.length === 0 && user.siesa_seller_code) {
        console.log('  ⚠ Sin mapeos en user_companies; no se puede determinar la compañía.');
      }

      const rows = [];
      for (const { companyId, sellerCode } of perCompany) {
        const clientsRes = await client.query(
          `SELECT id, code, name, branch, branch_name, price_list, payment_term,
                  seller_code, address, neighborhood, city, department, phone, email
           FROM client_records
           WHERE company_id = $1 AND seller_code = $2
           ORDER BY name ASC`,
          [companyId, sellerCode],
        );
        console.log(
          `  Compañía ${companyId} · código vendedor "${sellerCode}": ${clientsRes.rowCount} clientes`,
        );

        for (const c of clientsRes.rows) {
          const ordersRes = await client.query(
            `SELECT COUNT(*)::int AS n, MAX(created_at) AS last_order
             FROM orders WHERE customer_id = $1`,
            [c.id],
          );
          const ordersCount = ordersRes.rows[0].n;
          const lastOrder = ordersRes.rows[0].last_order;
          const portfolio = await fetchPortfolio(companyId, c.code);

          rows.push({
            Compañía: companyId,
            Código: c.code,
            Nombre: c.name,
            Sucursal: c.branch,
            'Nombre sucursal': c.branch_name ?? '',
            Dirección: c.address ?? '',
            Barrio: c.neighborhood ?? '',
            Ciudad: c.city ?? '',
            Departamento: c.department ?? '',
            Celular: c.phone ?? '',
            Email: c.email ?? '',
            'Lista de precios': c.price_list ?? '',
            'Condición de pago': c.payment_term ?? '',
            'Código vendedor': c.seller_code ?? '',
            Atendido: ordersCount > 0 ? 'SI' : 'NO',
            'N° pedidos': ordersCount,
            'Último pedido': lastOrder ? new Date(lastOrder).toISOString().slice(0, 10) : '',
            'Cartera total': portfolio.error ? 'N/D' : portfolio.totalBalance,
            'Cartera vencida': portfolio.error ? 'N/D' : portfolio.overdueBalance,
            'Documentos cartera': portfolio.error ? 'N/D' : portfolio.docsCount,
          });
        }
      }

      const sheetName = `${documentId}`.slice(0, 31);
      const ws =
        rows.length > 0
          ? XLSX.utils.json_to_sheet(rows)
          : XLSX.utils.aoa_to_sheet([
              [`Sin clientes asignados a este vendedor (${documentId}).`],
            ]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      console.log(`  Total filas en la hoja: ${rows.length}`);
    }

    const outPath = path.join(__dirname, '..', '..', 'clientes-vendedores.xlsx');
    XLSX.writeFile(wb, outPath);
    console.log(`\n✅ Archivo generado: ${outPath}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
