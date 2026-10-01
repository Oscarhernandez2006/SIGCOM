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
    const [row] = await this.ds.query(`
      WITH d AS (SELECT (now() AT TIME ZONE 'America/Bogota')::date AS hoy)
      SELECT
        COUNT(o.id) FILTER (WHERE (o.created_at AT TIME ZONE 'America/Bogota')::date = d.hoy
                         AND o.status NOT IN ('draft','cancelled','bounced','disapproved','expired')) AS pedidos_hoy,
        COUNT(o.id) FILTER (WHERE (o.created_at AT TIME ZONE 'America/Bogota')::date = d.hoy - 1
                         AND o.status NOT IN ('draft','cancelled','bounced','disapproved','expired')) AS pedidos_ayer,
        COALESCE(SUM(o.total) FILTER (WHERE (o.created_at AT TIME ZONE 'America/Bogota')::date = d.hoy
                         AND o.status NOT IN ('draft','cancelled','bounced','disapproved','expired')), 0) AS ventas_hoy,
        COUNT(o.id) FILTER (WHERE o.status = 'pending_approval') AS cartera_pendiente,
        (SELECT COUNT(*) FROM quotes q WHERE q.valid_until >= now()) AS cotizaciones_abiertas
      FROM d LEFT JOIN orders o ON true
      GROUP BY d.hoy
    `);
    const r = {
      pedidos_hoy: Number(row?.pedidos_hoy) || 0,
      pedidos_ayer: Number(row?.pedidos_ayer) || 0,
      ventas_hoy: Number(row?.ventas_hoy) || 0,
      cartera_pendiente: Number(row?.cartera_pendiente) || 0,
      cotizaciones_abiertas: Number(row?.cotizaciones_abiertas) || 0,
    };
    return {
      ...r,
      metrics: [
        { key: 'pedidos_hoy', label: 'Pedidos hoy', value: r.pedidos_hoy, hint: `${r.pedidos_ayer} ayer` },
        { key: 'ventas_hoy', label: 'Ventas hoy', value: r.ventas_hoy, format: 'currency' },
        { key: 'cartera_pendiente', label: 'Retenidos por cartera', value: r.cartera_pendiente, tone: r.cartera_pendiente > 0 ? 'warn' : 'default' },
        { key: 'cotizaciones_abiertas', label: 'Cotizaciones vigentes', value: r.cotizaciones_abiertas },
      ],
    };
  }
}
