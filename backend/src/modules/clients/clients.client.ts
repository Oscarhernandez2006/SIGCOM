import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/** Fila cruda devuelta por el endpoint de clientes. */
export interface ClientRaw {
  CODIGO?: string;
  TERCERO?: string;
  SUCURSAL?: string;
  NOMBRE_SUCURSAL?: string | null;
  LISTA_PRECIO?: string | null;
  COND_PAGO?: string | null;
  CODIGO_VENDEDOR?: string | null;
  DIRECCION?: string | null;
  BARRIO?: string | null;
  CIUDAD_MUNICIPIO?: string | null;
  DEPARTAMENTO?: string | null;
  CELULAR?: string | null;
  EMAIL?: string | null;
}

interface ClientsResponse {
  cia: number;
  count: number;
  data: ClientRaw[];
}

/** Fila cruda devuelta por el endpoint de cartera (un documento por cobrar). */
export interface PortfolioRaw {
  CIA?: number;
  CODIGO?: string;
  RAZON_SOCIAL?: string;
  SUCURSAL?: string;
  DESC_SUCURSAL?: string;
  CO?: string;
  TIPO_DOC_CRUCE?: string;
  DESCRIPCION?: string;
  CONS_DOC_CRUCE?: number;
  FECHA?: string;
  FECHA_VCTO?: string;
  DEBITO?: number;
  CREDITO?: number;
  SALDO?: number;
  // Cupo de crédito de la sucursal (se repite en cada fila de la sucursal).
  CUPO_CREDITO?: number;
  SALDO_TOTAL_SUCURSAL?: number;
  CUPO_DISPONIBLE?: number;
  /** "SI" / "NO": Siesa bloquea pedidos que superen el cupo. */
  BLOQUEO_CUPO?: string;
  PORC_TOLERANCIA?: number;
  DIAS_GRACIA?: number;
  FECHA_CUPO?: string | null;
  // Nombres alternos del cupo usados por versiones anteriores de la consulta.
  CUPO?: number;
  VLR_CUPO?: number;
  CUPO_APROBADO?: number;
}

interface PortfolioResponse {
  cia: number;
  nit: string;
  count: number;
  // El cupo puede venir a nivel de encabezado de la respuesta (no por fila).
  cupo?: number;
  cupo_credito?: number;
  CUPO?: number;
  data: PortfolioRaw[];
}

/**
 * Cliente del endpoint de clientes del Grupo Santacruz.
 *
 * GET {baseUrl}/clientes-por-cia?cia={companyId}&token={token}
 *
 * Reutiliza la misma base/token configurados para listas de precios
 * (mismo host y token).
 */
@Injectable()
export class ClientsClient {
  private readonly logger = new Logger(ClientsClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** Trae todos los clientes de una compañía. */
  async fetchClients(companyId: string): Promise<ClientRaw[]> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');

    try {
      const response = await firstValueFrom(
        this.http.get<ClientsResponse>(`${baseUrl}/clientes-por-cia`, {
          params: { cia: companyId, token },
          timeout,
        }),
      );
      return response.data?.data ?? [];
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Error desconocido';
      this.logger.error(
        `Error consultando clientes (compañía ${companyId}): ${message}`,
      );
      throw new InternalServerErrorException(
        'Error consultando los clientes en Siesa.',
      );
    }
  }

  /**
   * Trae la cartera (documentos por cobrar) de un cliente.
   *
   * GET {baseUrl}/cartera?cia={companyId}&nit={nit}&token={token}
   *
   * Devuelve los documentos y, si el ERP lo incluye, el cupo de crédito del
   * cliente (a nivel de encabezado o de fila). Si no viene, `creditLimit` es 0.
   */
  async fetchPortfolio(
    companyId: string,
    nit: string,
  ): Promise<{ rows: PortfolioRaw[]; creditLimit: number }> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');

    try {
      const response = await firstValueFrom(
        this.http.get<PortfolioResponse>(`${baseUrl}/cartera`, {
          params: { cia: companyId, nit, token },
          timeout,
        }),
      );
      const body = response.data;
      const rows = body?.data ?? [];
      const headerCupo = Number(body?.cupo ?? body?.cupo_credito ?? body?.CUPO ?? 0) || 0;
      const rowCupo = rows.reduce((max, r) => {
        const c =
          Number(r.CUPO ?? r.CUPO_CREDITO ?? r.VLR_CUPO ?? r.CUPO_APROBADO ?? 0) || 0;
        return c > max ? c : max;
      }, 0);
      return { rows, creditLimit: headerCupo > 0 ? headerCupo : rowCupo };
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Error desconocido';
      this.logger.error(
        `Error consultando cartera (compañía ${companyId}, nit ${nit}): ${message}`,
      );
      throw new InternalServerErrorException(
        'Error consultando la cartera del cliente en Siesa.',
      );
    }
  }
}
