import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SharedSecretGuard } from './modules/provisioning/guards/shared-secret.guard';

@Controller()
export class AppController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Get('health')
  health() {
    return { service: 'SIGCOM API', status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Resumen ejecutivo para el dashboard cruzado de la Suite. */
  @Get('resumen-ejecutivo')
  @UseGuards(SharedSecretGuard)
  async resumenEjecutivo() {
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      const [row] = await this.ds.query(`
        SELECT
          COUNT(*) FILTER (WHERE o.created_at::date = $1::date AND o.status NOT IN ('CANCELLED','BOUNCED')) AS pedidos_hoy,
          COUNT(*) FILTER (WHERE o.created_at::date = $2::date AND o.status NOT IN ('CANCELLED','BOUNCED')) AS pedidos_ayer,
          COUNT(*) FILTER (WHERE o.cartera_status = 'PENDING') AS cartera_pendiente,
          (SELECT COUNT(*) FROM quotes q WHERE q.status = 'OPEN') AS cotizaciones_abiertas
        FROM orders o
      `, [hoy, ayer]);

      return {
        pedidos_hoy: parseInt(row.pedidos_hoy, 10) || 0,
        pedidos_ayer: parseInt(row.pedidos_ayer, 10) || 0,
        cartera_pendiente: parseInt(row.cartera_pendiente, 10) || 0,
        cotizaciones_abiertas: parseInt(row.cotizaciones_abiertas, 10) || 0,
      };
    } catch {
      return { pedidos_hoy: 0, pedidos_ayer: 0, cartera_pendiente: 0, cotizaciones_abiertas: 0 };
    }
  }
}
