import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { baseCompanyId } from '../../common/companies';

/** Fila cruda de ventas por canal/vendedor del endpoint del Grupo Santacruz. */
export interface ChannelSaleRaw {
  fecha?: string;
  referencia?: string;
  descripcion?: string;
  cantidad?: number;
  valor_neto?: number;
  valor_bruto?: number;
  codigo_vendedor?: string;
  razon_social_vendedor?: string;
}

interface ChannelSalesResponse {
  total: number;
  limit: number;
  offset: number;
  count: number;
  has_more: boolean;
  next_offset: number | null;
  data: ChannelSaleRaw[];
}

/**
 * Cliente del endpoint de ventas por canal por vendedor.
 *
 * GET {baseUrl}/ventas/canales-vendedor?fecha_inicio&fecha_fin&id_cia&token
 *
 * La respuesta viene paginada (limit/offset/has_more/next_offset). Siempre se
 * consulta el ERP; la última respuesta por (compañía + rango) solo se usa como
 * respaldo si la consulta falla.
 */
@Injectable()
export class ChannelSalesClient {
  private readonly logger = new Logger(ChannelSalesClient.name);
  private readonly cache = new Map<
    string,
    { at: number; rows: ChannelSaleRaw[] }
  >();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** Trae todas las filas de ventas por canal de una compañía en un rango. */
  async fetch(
    companyId: string,
    from: string,
    to: string,
  ): Promise<ChannelSaleRaw[]> {
    // Compañías virtuales (p. ej. MONTERIA TAT) consultan el canal de su base.
    companyId = baseCompanyId(companyId);
    const key = `${companyId}|${from}|${to}`;

    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');

    const all: ChannelSaleRaw[] = [];
    const limit = 1000;
    let offset = 0;
    let guard = 0;

    try {
      while (guard < 60) {
        const res = await firstValueFrom(
          this.http.get<ChannelSalesResponse>(
            `${baseUrl}/ventas/canales-vendedor`,
            {
              params: {
                fecha_inicio: from,
                fecha_fin: to,
                id_cia: companyId,
                token,
                limit,
                offset,
              },
              timeout,
            },
          ),
        );
        const rows = res.data?.data ?? [];
        all.push(...rows);
        if (!res.data?.has_more || rows.length === 0) break;
        offset = res.data.next_offset ?? offset + limit;
        guard++;
      }
      this.cache.set(key, { at: Date.now(), rows: all });
      return all;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(
        `No se pudieron consultar ventas por canal (compañía ${companyId}): ${msg}`,
      );
      const cached = this.cache.get(key);
      return cached?.rows ?? [];
    }
  }
}
