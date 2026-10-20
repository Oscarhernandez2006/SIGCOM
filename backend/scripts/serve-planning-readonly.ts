import 'reflect-metadata';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { config } from 'dotenv';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import configuration from '../src/config/configuration';
import { Order } from '../src/modules/orders/entities/order.entity';
import { DispatchPlanningController } from '../src/modules/dispatch/dispatch-planning.controller';

async function main() {
  config({ path: resolve(__dirname, '../.env'), quiet: true });
  const token = process.env.DISPATCH_API_TOKEN;
  if (!token) throw new Error('Falta DISPATCH_API_TOKEN.');
  const db = configuration().database;
  const source = new DataSource({
    type: 'postgres', host: db.host, port: db.port, username: db.username,
    password: db.password, database: db.name,
    entities: getMetadataArgsStorage().tables.map((table) => table.target).filter((target): target is Function => typeof target === 'function'),
    synchronize: false, migrationsRun: false, installExtensions: false, logging: false,
    extra: { options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 15000 },
  });
  await source.initialize();
  const controller = new DispatchPlanningController(source.getRepository(Order));
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const provided = Buffer.from(String(req.headers['x-api-key'] ?? ''));
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      res.writeHead(401).end(JSON.stringify({ error: 'Token invalido.' }));
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method !== 'GET' || url.pathname !== '/api/public/dispatch/planning-orders') {
      res.writeHead(404).end(JSON.stringify({ error: 'Ruta no disponible.' }));
      return;
    }
    try {
      const resultado = await controller.list(url.searchParams.get('fecha') ?? '');
      res.end(JSON.stringify(resultado));
    } catch (error) {
      const status = typeof (error as { getStatus?: () => number }).getStatus === 'function' ? (error as { getStatus: () => number }).getStatus() : 500;
      res.writeHead(status).end(JSON.stringify({ error: status === 400 ? 'Fecha invalida.' : 'No se pudieron leer los pedidos.' }));
    }
  });
  server.on('error', async (error) => { console.error(error.message); await source.destroy(); process.exitCode = 1; });
  server.listen(4317, '127.0.0.1', () => console.log('API temporal de solo lectura: http://127.0.0.1:4317/api/public/dispatch/planning-orders'));
  const cerrar = () => { server.close(() => { void source.destroy().finally(() => process.exit()); }); };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });