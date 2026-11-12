import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type {
  ClientDetailRaw,
  PortfolioHistoryRaw,
} from './certificates.types';

interface ListResponse<T> {
  count?: number;
  data?: T[];
}

/** El detalle de clientes trae toda la compañía; se cachea unos minutos. */
const DETAIL_CACHE_MS = 10 * 60 * 1000;

/**
 * Consultas a Siesa para los certificados de referencia comercial:
 *
 * GET {baseUrl}/clientes-por-cia-detalle?cia&token
 * GET {baseUrl}/cartera-historico?cia&nit&desde&hasta&token
 *
 * Usa la misma base/token que las listas de precios.
 */
@Injectable()
export class CertificatesClient {
  private readonly logger = new Logger(CertificatesClient.name);
  private readonly detailCache = new Map<
    string,
    { at: number; rows: Promise<ClientDetailRaw[]> }
  >();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** Sucursales de un cliente con sus condiciones comerciales. */
  async fetchClientDetail(
    companyId: string,
    nit: string,
  ): Promise<ClientDetailRaw[]> {
    const rows = await this.companyDetail(companyId);
    return rows.filter((r) => (r.CODIGO ?? '').trim() === nit);
  }

  /** Documentos (pagados y abiertos) del cliente en el periodo. */
  async fetchHistory(
    companyId: string,
    nit: string,
    from: string,
    to: string,
  ): Promise<PortfolioHistoryRaw[]> {
    const body = await this.get<ListResponse<PortfolioHistoryRaw>>(
      'cartera-historico',
      { cia: companyId, nit, desde: from, hasta: to },
      'el histórico de cartera',
    );
    return body?.data ?? [];
  }

  private companyDetail(companyId: string): Promise<ClientDetailRaw[]> {
    const cached = this.detailCache.get(companyId);
    if (cached && Date.now() - cached.at < DETAIL_CACHE_MS) return cached.rows;

    const rows = this.get<ListResponse<ClientDetailRaw>>(
      'clientes-por-cia-detalle',
      { cia: companyId },
      'el detalle de clientes',
    ).then((body) => body?.data ?? []);
    this.detailCache.set(companyId, { at: Date.now(), rows });
    // Si falla, no se deja la promesa rechazada en caché.
    rows.catch(() => this.detailCache.delete(companyId));
    return rows;
  }

  private async get<T>(
    path: string,
    params: Record<string, string>,
    label: string,
  ): Promise<T> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');
    try {
      const response = await firstValueFrom(
        this.http.get<T>(`${baseUrl}/${path}`, {
          params: { ...params, token },
          timeout,
        }),
      );
      return response.data;
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Error desconocido';
      this.logger.error(
        `Error consultando ${label} (${JSON.stringify(params)}): ${message}`,
      );
      throw new InternalServerErrorException(
        `Error consultando ${label} en Siesa.`,
      );
    }
  }
}
