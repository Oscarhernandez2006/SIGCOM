import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InternalServerErrorException } from '@nestjs/common';

/** Fila cruda devuelta por el endpoint de listas de precios. */
export interface PriceListRaw {
  LISTA_PRECIO?: string;
  DESC_LISTA?: string;
  REFERENCIA?: string;
  PRODUCTO?: string;
  UM?: string;
  PRECIO?: number;
  /** Categoría del producto (p. ej. "0001 - BIENES"). */
  CATEGORIA?: string;
  /** Subcategoría/especie (p. ej. "0001 - RES", "0002 - CERDO"). */
  SUBCATEGORIA?: string;
  /** Fecha desde la que aplica el precio (ISO, p. ej. "2025-12-24T00:00:00"). */
  FECHA_ACTIVACION?: string;
  /** Fecha hasta la que aplica el precio (ISO). */
  FECHA_INACTIVACION?: string;
}

interface PriceListResponse {
  cia: number;
  count: number;
  data: PriceListRaw[];
}

/** Fila cruda del endpoint de subproductos (categoría CERDO / RES). */
interface SubproductoRaw {
  referencia?: string;
  descripcion_producto?: string;
  categoria?: string;
}

interface SubproductoResponse {
  total: number;
  data: SubproductoRaw[];
}

/** Fila cruda del endpoint de ventas por vendedor y producto (mensual). */
export interface VendorProductSaleRaw {
  /** Fecha del movimiento (YYYY-MM-DD). El ERP la renombró de `fecha` a `dia`. */
  dia?: string;
  fecha?: string;
  /** Identificador del vendedor. Hoy el ERP solo envía la razón social (nombre). */
  nit_vendedor?: string;
  codigo_vendedor?: string;
  razon_social_vendedor?: string;
  referencia?: string;
  descripcion?: string;
  periodo?: number;
  cantidad_base?: number;
  costo_total?: number;
  valor_bruto?: number;
  valor_neto?: number;
  criterio?: string;
  descripcion_criterio?: string;
  /** Clasificación del producto: CORTE / SUBPRODUCTO / CANAL / SERVICIO / ... */
  criterio_producto?: string;
}

/**
 * Fila cruda del endpoint corregido de ventas por producto. Trae detalle por
 * día y por vendedor, con los nombres nuevos de producto (`categoria`,
 * `referencia_producto`, `kilos`, `total_facturas`, `costo_total`).
 */
interface VendorProductAggRaw {
  compania?: number;
  dia?: string;
  nit_vendedor?: string;
  codigo_vendedor?: string;
  razon_social_vendedor?: string;
  id_categoria?: string;
  categoria?: string;
  codigo_producto?: number;
  referencia_producto?: string;
  descripcion_producto?: string;
  periodo?: number;
  kilos?: number;
  total_facturas?: number;
  costo_total?: number;
  margen?: number;
}

interface VendorProductAggResponse {
  total?: number;
  has_more?: boolean;
  next_offset?: number | null;
  data: VendorProductAggRaw[];
}

/**
 * Fila cruda del endpoint GENERAL por vendedor (una fila por vendedor con la
 * venta acumulada, kilos, costo y margen del período/rango). No trae desglose
 * por producto: ese sigue en `vendedor-productos-mes`.
 */
export interface VendorMonthlySaleRaw {
  nit_vendedor?: string;
  razon_social_vendedor?: string;
  codigo_vendedor?: string;
  kilos?: number;
  total_facturas?: number;
  costo_total?: number;
  margen?: number;
  periodo?: number;
}

interface VendorMonthlySalesResponse {
  total?: number;
  has_more?: boolean;
  next_offset?: number;
  data: VendorMonthlySaleRaw[];
}

/**
 * Clasificación canónica de subproductos (RES=bovino / CERDO=porcino) por
 * referencia. Es la fuente de la verdad para dividir el pedido: si el ERP
 * (`/ventas/subproductos`) no devuelve la categoría de una referencia (o la
 * devuelve distinta), este mapa manda. Así la división por especie es
 * consistente entre la creación del pedido y su subida a Siesa, evitando que
 * ambas mitades queden con el mismo consecutivo y Siesa rechace una.
 */
const SUBPRODUCTO_CATEGORIA_CANONICA: Record<string, 'RES' | 'CERDO'> = {
  // Subproductos de RES (bovino)
  '3202': 'RES',
  '3213': 'RES',
  '3222': 'RES',
  '3235': 'RES',
  '3252': 'RES',
  '3023': 'RES',
  '3258': 'RES',
  '3212': 'RES',
  '3002': 'RES',
  '3021': 'RES',
  '3241': 'RES',
  '3014': 'RES',
  '3003': 'RES',
  '3210': 'RES',
  '3250': 'RES',
  '3251': 'RES',
  '3207': 'RES',
  '1618': 'RES',
  '1635': 'RES',
  '1700': 'RES',
  '3243': 'RES',
  '3208': 'RES',
  '2404': 'RES',
  '2405': 'RES',
  '2406': 'RES',
  '2422': 'RES',
  '2410': 'RES',
  '2432': 'RES',
  '2433': 'RES',
  '2436': 'RES',
  '2443': 'RES',
  // Subproductos de CERDO (porcino)
  '4002': 'CERDO',
  '4010': 'CERDO',
  '4003': 'CERDO',
  '2002': 'CERDO',
  '2416': 'CERDO',
  '2133': 'CERDO',
  '2132': 'CERDO',
  '4015': 'CERDO',
  '4040': 'CERDO',
  '4009': 'CERDO',
  '2444': 'CERDO',
  '2446': 'CERDO',
  '2417': 'CERDO',
  '2445': 'CERDO',
  '2448': 'CERDO',
  '2447': 'CERDO',
  '2442': 'CERDO',
  '2431': 'CERDO',
  '2177': 'CERDO',
};

/**
 * Cliente del endpoint de listas de precios del Grupo Santacruz.
 *
 * GET {baseUrl}/listas-precios?cia={companyId}&token={token}
 */
@Injectable()
export class PriceListsClient {
  private readonly logger = new Logger(PriceListsClient.name);

  /** Caché en memoria del mapa SKU→categoría de subproductos por compañía. */
  private readonly subproductoCache = new Map<
    string,
    { expiresAt: number; data: Map<string, string> }
  >();
  private static readonly SUBPRODUCTO_TTL_MS = 10 * 60 * 1000;

  /** Caché del mapa SKU→subcategoría (RES/CERDO/...) de cortes por compañía. */
  private readonly corteCategoryCache = new Map<
    string,
    { expiresAt: number; data: Map<string, string> }
  >();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** Trae todas las filas de listas de precios de una compañía. */
  async fetchPriceLists(companyId: string): Promise<PriceListRaw[]> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');

    try {
      const response = await firstValueFrom(
        this.http.get<PriceListResponse>(`${baseUrl}/listas-precios`, {
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
        `Error consultando listas de precios (compañía ${companyId}): ${message}`,
      );
      throw new InternalServerErrorException(
        'Error consultando las listas de precios en Siesa.',
      );
    }
  }

  /**
   * Mapa `SKU -> subcategoría` (RES / CERDO / CARNES FRIAS / ...) de los cortes,
   * tomado de la lista de precios del ERP (campo SUBCATEGORIA). Se cachea en
   * memoria. Si el ERP falla, retorna un mapa vacío (la división es opcional).
   */
  async fetchCorteCategories(companyId: string): Promise<Map<string, string>> {
    const cached = this.corteCategoryCache.get(companyId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const map = new Map<string, string>();
    try {
      const rows = await this.fetchPriceLists(companyId);
      for (const r of rows) {
        const sku = (r.REFERENCIA ?? '').trim();
        const sub = (r.SUBCATEGORIA ?? '').trim();
        if (!sku || !sub) continue;
        // "0001 - RES" -> "RES"; si no trae el prefijo, se usa tal cual.
        const label = (
          sub.includes(' - ') ? sub.split(' - ').slice(1).join(' - ') : sub
        )
          .trim()
          .toUpperCase();
        if (label) map.set(sku, label);
      }
      this.corteCategoryCache.set(companyId, {
        expiresAt: Date.now() + PriceListsClient.SUBPRODUCTO_TTL_MS,
        data: map,
      });
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Error desconocido';
      this.logger.error(
        `Error consultando categorías de cortes (compañía ${companyId}): ${message}`,
      );
    }
    return map;
  }

  /**
   * Trae el mapa `SKU -> categoría` (CERDO / RES) de los subproductos desde el
   * ERP. Una sola consulta devuelve ambas categorías. Se cachea en memoria.
   *
   * GET {baseUrl}/ventas/subproductos?cia={companyId}&plan1=003&plan_categoria=002&token={token}
   */
  async fetchSubproductoCategories(
    companyId: string,
  ): Promise<Map<string, string>> {
    const cached = this.subproductoCache.get(companyId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');

    try {
      const response = await firstValueFrom(
        this.http.get<SubproductoResponse>(`${baseUrl}/ventas/subproductos`, {
          params: { cia: companyId, plan1: '003', plan_categoria: '002', token },
          timeout,
        }),
      );
      const map = new Map<string, string>();
      for (const row of response.data?.data ?? []) {
        const sku = (row.referencia ?? '').trim();
        const cat = (row.categoria ?? '').trim().toUpperCase();
        if (sku && cat) map.set(sku, cat);
      }
      // La clasificación canónica manda sobre lo que devuelva el ERP: corrige
      // categorías erróneas y llena las que el ERP no trae, garantizando una
      // división RES/CERDO consistente.
      for (const [sku, cat] of Object.entries(SUBPRODUCTO_CATEGORIA_CANONICA)) {
        if (map.get(sku) !== cat) {
          this.logger.warn(
            `Subproducto ${sku}: categoría canónica ${cat} ` +
              `(ERP devolvió ${map.get(sku) ?? 'nada'}).`,
          );
        }
        map.set(sku, cat);
      }
      this.subproductoCache.set(companyId, {
        expiresAt: Date.now() + PriceListsClient.SUBPRODUCTO_TTL_MS,
        data: map,
      });
      return map;
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Error desconocido';
      this.logger.error(
        `Error consultando subproductos (compañía ${companyId}): ${message}`,
      );
      // Si el ERP falla, se usa al menos la clasificación canónica para no
      // romper la división por especie.
      return new Map<string, string>(
        Object.entries(SUBPRODUCTO_CATEGORIA_CANONICA),
      );
    }
  }

  /**
   * Ventas por producto de un mes/rango (cortes, subproductos y canales),
   * AGREGADAS por producto (una fila por referencia). El ERP corrigió la
   * consulta: ya no trae detalle por día ni por vendedor y excluye traslados
   * (AGROPECUARIA SANTACRUZ LTDA) y vendedores sin clase.
   *
   * GET {baseUrl}/ventas/vendedor-productos-mes?compania&periodo&fecha_inicio&fecha_fin&token
   *
   * Se mapea a {@link VendorProductSaleRaw} (compatibilidad): `categoria` →
   * `criterio_producto`, `total_facturas` → `valor_bruto`/`valor_neto`, etc.
   */
  async fetchVendorProductSales(
    compania: string,
    periodo: string,
    fechaInicio?: string,
    fechaFin?: string,
  ): Promise<VendorProductSaleRaw[]> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');
    const PAGE = 5000;
    const MAX_PAGES = 20;
    // CARNES FRIAS (cía 8) tiene su propio endpoint de facturación.
    const path =
      compania === '8'
        ? '/ventas/vendedor-productos-carnesfrias'
        : '/ventas/vendedor-productos-mes';
    try {
      const out: VendorProductSaleRaw[] = [];
      let offset = 0;
      let page = 0;
      while (page < MAX_PAGES) {
        const response = await firstValueFrom(
          this.http.get<VendorProductAggResponse>(
            `${baseUrl}${path}`,
            {
              params: {
                compania,
                periodo,
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                limit: PAGE,
                offset,
                token,
              },
              timeout,
            },
          ),
        );
        const batch = response.data?.data ?? [];
        for (const r of batch) {
          const bruto = Number(r.total_facturas) || 0;
          out.push({
            dia: r.dia,
            periodo: Number(r.periodo) || undefined,
            nit_vendedor: r.nit_vendedor,
            codigo_vendedor: r.codigo_vendedor,
            razon_social_vendedor: r.razon_social_vendedor,
            referencia: (r.referencia_producto ?? '').trim(),
            descripcion: (r.descripcion_producto ?? '').trim(),
            criterio_producto: (r.categoria ?? '').trim(),
            cantidad_base: Number(r.kilos) || 0,
            valor_bruto: bruto,
            valor_neto: bruto,
            costo_total: Number(r.costo_total) || 0,
          });
        }
        page++;
        if (batch.length === 0 || !response.data?.has_more) break;
        offset = response.data?.next_offset ?? offset + batch.length;
      }
      return out;
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Error desconocido';
      this.logger.error(
        `Error consultando ventas por producto (compañía ${compania}, periodo ${periodo}): ${message}`,
      );
      throw new InternalServerErrorException(
        'Error consultando las ventas por producto en Siesa.',
      );
    }
  }

  /**
   * Ventas GENERALES por vendedor (acumulado del rango): una fila por vendedor
   * con `total_facturas` (venta), `kilos`, `costo_total` y `margen`.
   * GET {baseUrl}/ventas/dashboard-comercial?compania&periodo&fecha_inicio&fecha_fin&token
   */
  async fetchVendorMonthlySales(
    compania: string,
    periodo: string,
    fechaInicio?: string,
    fechaFin?: string,
  ): Promise<VendorMonthlySaleRaw[]> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');
    const PAGE = 5000;
    const MAX_PAGES = 20;
    try {
      const rows: VendorMonthlySaleRaw[] = [];
      let offset = 0;
      let page = 0;
      while (page < MAX_PAGES) {
        const response = await firstValueFrom(
          this.http.get<VendorMonthlySalesResponse>(
            `${baseUrl}/ventas/dashboard-comercial`,
            {
              params: {
                compania,
                periodo,
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                limit: PAGE,
                offset,
                token,
              },
              timeout,
            },
          ),
        );
        const batch = response.data?.data ?? [];
        rows.push(...batch);
        page++;
        if (batch.length === 0 || !response.data?.has_more) break;
        offset = response.data?.next_offset ?? offset + batch.length;
      }
      return rows;
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? (error as { message: string }).message
          : 'Error desconocido';
      this.logger.error(
        `Error consultando ventas generales por vendedor (compañía ${compania}, periodo ${periodo}): ${message}`,
      );
      throw new InternalServerErrorException(
        'Error consultando las ventas generales por vendedor en Siesa.',
      );
    }
  }
}
