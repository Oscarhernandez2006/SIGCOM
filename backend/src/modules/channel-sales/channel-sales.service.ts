import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Between, DataSource, Repository } from 'typeorm';
import { ChannelSale } from './entities/channel-sale.entity';
import { ChannelSalesClient } from './channel-sales.client';
import { COMPANIES, baseCompanyId } from '../../common/companies';
import { bogotaToday } from '../orders/order-cortes';

/** Una fila del reporte de ventas por canal (agrupada por día/vendedor/canal). */
export interface ChannelSaleReportRow {
  date: string;
  companyId: string;
  sellerCode: string;
  sellerName: string | null;
  channel: string;
  kilos: number;
  revenue: number;
}

@Injectable()
export class ChannelSalesService {
  private readonly logger = new Logger(ChannelSalesService.name);

  constructor(
    @InjectRepository(ChannelSale)
    private readonly repository: Repository<ChannelSale>,
    private readonly client: ChannelSalesClient,
    private readonly dataSource: DataSource,
  ) {}

  private shiftDate(date: string, days: number): string {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  }

  /**
   * Sincroniza (reemplaza) las ventas por canal de una compañía en un rango
   * [from, to] con los datos frescos del ERP.
   */
  async syncRange(
    companyId: string,
    from: string,
    to: string,
  ): Promise<{ rows: number }> {
    const raws = await this.client.fetch(companyId, from, to);
    const mapped = raws
      .filter((r) => r.fecha)
      .map((r) => ({
        companyId,
        saleDate: (r.fecha ?? '').slice(0, 10),
        sellerCode: (r.codigo_vendedor ?? '').trim(),
        sellerName: (r.razon_social_vendedor ?? '').trim() || undefined,
        reference: (r.referencia ?? '').trim() || undefined,
        channel: (r.descripcion ?? '').trim() || 'Sin canal',
        kilos: Number(r.cantidad ?? 0),
        revenue: Number(r.valor_neto ?? r.valor_bruto ?? 0),
      }));

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ChannelSale);
      await repo.delete({ companyId, saleDate: Between(from, to) });
      for (const chunk of this.chunk(mapped, 500)) {
        if (chunk.length > 0) await repo.insert(chunk);
      }
    });

    return { rows: mapped.length };
  }

  /** Sincroniza todas las compañías para un rango. */
  async syncAll(from: string, to: string): Promise<{ rows: number }> {
    let rows = 0;
    // Solo compañías reales de Siesa; las virtuales (p. ej. MONTERIA TAT)
    // consultan el ERP de su base y no almacenan un duplicado.
    const realCompanies = COMPANIES.filter((c) => baseCompanyId(c.id) === c.id);
    for (const c of realCompanies) {
      try {
        const r = await this.syncRange(c.id, from, to);
        rows += r.rows;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'desconocido';
        this.logger.warn(
          `Error sincronizando ventas por canal (compañía ${c.id}, ${from}..${to}): ${msg}`,
        );
      }
    }
    this.logger.log(
      `Ventas por canal sincronizadas (${from}..${to}): ${rows} filas.`,
    );
    return { rows };
  }

  /** Cada hora refresca las ventas por canal del día en curso. */
  @Cron(CronExpression.EVERY_HOUR)
  async syncTodayJob(): Promise<void> {
    const today = bogotaToday();
    await this.syncAll(today, today);
  }

  /** Cada día a la 1:00 finaliza (reemplaza) las ventas del día anterior. */
  @Cron('0 1 * * *')
  async syncYesterdayJob(): Promise<void> {
    const yesterday = this.shiftDate(bogotaToday(), -1);
    await this.syncAll(yesterday, yesterday);
  }

  /**
   * Reporte de ventas por canal, agrupado por día, vendedor y canal, filtrable
   * por rango de fechas, compañía y vendedor (cédula).
   */
  async report(params: {
    from: string;
    to: string;
    companyId?: string;
    sellerCode?: string;
  }): Promise<ChannelSaleReportRow[]> {
    const qb = this.repository
      .createQueryBuilder('cs')
      .select('cs.sale_date', 'date')
      .addSelect('cs.company_id', 'companyId')
      .addSelect('cs.seller_code', 'sellerCode')
      .addSelect('MAX(cs.seller_name)', 'sellerName')
      .addSelect('cs.channel', 'channel')
      .addSelect('COALESCE(SUM(cs.kilos), 0)', 'kilos')
      .addSelect('COALESCE(SUM(cs.revenue), 0)', 'revenue')
      .where('cs.sale_date BETWEEN :from AND :to', {
        from: params.from,
        to: params.to,
      })
      .groupBy('cs.sale_date')
      .addGroupBy('cs.company_id')
      .addGroupBy('cs.seller_code')
      .addGroupBy('cs.channel')
      .orderBy('cs.sale_date', 'ASC')
      .addOrderBy('cs.seller_code', 'ASC');

    if (params.companyId) {
      qb.andWhere('cs.company_id = :companyId', { companyId: params.companyId });
    }
    if (params.sellerCode) {
      qb.andWhere('cs.seller_code = :sellerCode', {
        sellerCode: params.sellerCode,
      });
    }

    const rows = await qb.getRawMany<{
      date: string;
      companyId: string;
      sellerCode: string;
      sellerName: string | null;
      channel: string;
      kilos: string;
      revenue: string;
    }>();

    return rows.map((r) => ({
      date: r.date,
      companyId: r.companyId,
      sellerCode: r.sellerCode,
      sellerName: r.sellerName ?? null,
      channel: r.channel,
      kilos: Number(r.kilos),
      revenue: Number(r.revenue),
    }));
  }
}
