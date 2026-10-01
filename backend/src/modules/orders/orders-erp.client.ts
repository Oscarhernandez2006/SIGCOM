import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import {
  getOrderEndpoint,
  getOrderDocTypes,
  baseCompanyId,
} from '../../common/companies';

/** Una línea (registro) del pedido en el formato que espera el ERP. */
export interface ErpOrderRegistro {
  documento_venta: string;
  fecha: string;
  cliente: string;
  sucursal: string;
  vendedor: string;
  fecha_de_entrega: string;
  bodega: string;
  referencia: string;
  um: string;
  cantidad: string;
  precio: string;
  cond_pago: string;
  /** Notas del pedido (logística y producto concatenadas). */
  notas: string;
  /**
   * Número de pedido de SIGCOM, enviado explícito (no inferido de
   * `documento_venta`) para que la app externa lo mapee de forma confiable a
   * la "Orden de compra" del registro 430, sin depender de un fallback.
   */
  npedido_sigcom: string;
  /** Tipo de entrega: 'DESPACHO' o 'RECOGIDA'. */
  tipo_entrega: string;
}

/** Estado de un pedido en Siesa (respuesta de pedidos-estados-siesa). */
export interface ErpOrderState {
  CIA: number;
  CO: string;
  TIPO_DOC: string;
  CONSECUTIVO: number;
  ESTADO: number;
  FECHA: string;
  DESC_ESTADO: string;
  /** Referencia libre del documento en Siesa (suele venir vacía). */
  REFERENCIA: string;
  /**
   * Número de documento de referencia. Aquí cae el `documento_venta` que
   * enviamos al subir el pedido, así que es la clave para cruzar con nuestros
   * pedidos (equivale a nuestro `orderNumber`).
   */
  NUM_REFERENCIA: string;
  /** 1 = el pedido ya fue facturado; 0 = aún no. */
  FACTURADO: number;
  /** 1 = el pedido ya fue despachado (remisionado); 0 = aún no. */
  DESPACHADO: number;
}

/** Resultado de subir un pedido al ERP. */
export interface ErpUploadResult {
  /** Consecutivo real que Siesa asignó al pedido (si se pudo extraer). */
  consecutivo?: string;
  /** Respuesta cruda del ERP, para diagnóstico. */
  raw: unknown;
}

/**
 * Cliente del endpoint de carga de pedidos del Grupo Santacruz.
 *
 * POST {baseUrl}/{endpoint-por-compañía}?token={token}
 * Body: { registros: ErpOrderRegistro[] }
 */
@Injectable()
export class OrdersErpClient {
  private readonly logger = new Logger(OrdersErpClient.name);

  /**
   * Caché en memoria de los estados por compañía. Evita golpear el ERP en cada
   * consulta del frontend: la respuesta se reutiliza durante STATES_TTL_MS y
   * las peticiones concurrentes comparten la misma llamada en vuelo.
   */
  private readonly statesCache = new Map<
    string,
    { expiresAt: number; data: ErpOrderState[] }
  >();
  private readonly statesInflight = new Map<
    string,
    Promise<ErpOrderState[]>
  >();
  private static readonly STATES_TTL_MS = 5_000;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** Sube las líneas de un pedido al ERP. Lanza si la respuesta no es exitosa. */
  async uploadOrder(
    companyId: string,
    registros: ErpOrderRegistro[],
  ): Promise<ErpUploadResult> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('ordersUpload.timeoutMs');
    const endpoint = getOrderEndpoint(companyId);

    // Se registra el cliente y la sucursal de cada línea que se envía al ERP
    // para poder auditar qué sucursal viaja realmente y descartar que el código
    // la altere de nuestro lado.
    this.logger.log(
      `Payload de carga (compañía ${companyId}): ` +
        JSON.stringify(
          registros.map((r) => ({
            documento_venta: r.documento_venta,
            cliente: r.cliente,
            sucursal: r.sucursal,
            referencia: r.referencia,
            notas: r.notas,
          })),
        ),
    );

    try {
      const response = await firstValueFrom(
        this.http.post<unknown>(
          `${baseUrl}/${endpoint}`,
          { registros },
          { params: { token }, timeout },
        ),
      );
      // Se registra la respuesta cruda para conocer el formato exacto del ERP
      // y poder ajustar el parseo del consecutivo si cambia.
      this.logger.log(
        `Respuesta de carga (compañía ${companyId}): ${JSON.stringify(response.data)}`,
      );
      // Siesa puede responder HTTP 200 pero rechazar el pedido dentro de
      // `respuesta_siesa` (printTipoError != 0). Sin esta validación el pedido
      // quedaría "enviado" aunque Siesa lo rechazó.
      this.assertErpAccepted(response.data, endpoint);
      const consecutivo = this.extractConsecutivo(response.data);
      if (!consecutivo) {
        this.logger.warn(
          `No se pudo extraer el consecutivo de Siesa de la respuesta de carga ` +
            `(compañía ${companyId}). El estado del pedido no se podrá sincronizar.`,
        );
      }
      // Al subir un pedido los estados quedan desactualizados: se invalida la
      // caché para que la próxima consulta traiga el dato fresco.
      this.statesCache.delete(companyId);
      return { consecutivo, raw: response.data };
    } catch (error) {
      const message = this.describeError(error);
      this.logger.error(`Error subiendo pedido al ERP: ${message}`);
      throw new Error(message);
    }
  }

  /**
   * Sube un pedido de subproductos al ERP dividido por categoría:
   *  - RES (bovino) → /ventas/pedidos-subproductos-bovino
   *  - CERDO (porcino) → /ventas/pedidos-subproductos-porcino
   * Ambas partes comparten el mismo documento_venta (consecutivo). Devuelve el
   * consecutivo que asignó Siesa (de la primera respuesta que lo traiga).
   */
  async uploadSubproductos(
    bovino: ErpOrderRegistro[],
    porcino: ErpOrderRegistro[],
  ): Promise<ErpUploadResult> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('ordersUpload.timeoutMs');

    const post = async (
      path: string,
      registros: ErpOrderRegistro[],
    ): Promise<unknown> => {
      this.logger.log(
        `Payload subproductos (${path}): ` +
          JSON.stringify(
            registros.map((r) => ({
              documento_venta: r.documento_venta,
              cliente: r.cliente,
              referencia: r.referencia,
              cantidad: r.cantidad,
            })),
          ),
      );
      const response = await firstValueFrom(
        this.http.post<unknown>(
          `${baseUrl}/${path}`,
          { registros },
          { params: { token }, timeout },
        ),
      );
      this.logger.log(
        `Respuesta subproductos (${path}): ${JSON.stringify(response.data)}`,
      );
      // Detecta rechazos de Siesa (printTipoError != 0) aunque el HTTP sea 200.
      this.assertErpAccepted(response.data, path);
      return response.data;
    };

    try {
      const raw: { bovino?: unknown; porcino?: unknown } = {};
      let consecutivo: string | undefined;

      if (porcino.length > 0) {
        raw.porcino = await post(
          'ventas/pedidos-subproductos-porcino',
          porcino,
        );
        consecutivo = consecutivo ?? this.extractConsecutivo(raw.porcino);
      }
      if (bovino.length > 0) {
        raw.bovino = await post('ventas/pedidos-subproductos-bovino', bovino);
        consecutivo = consecutivo ?? this.extractConsecutivo(raw.bovino);
      }

      // La carga invalida los estados cacheados de Agropecuaria (compañía 3).
      this.statesCache.delete('3');
      return { consecutivo, raw };
    } catch (error) {
      const message = this.describeError(error);
      this.logger.error(`Error subiendo subproductos al ERP: ${message}`);
      throw new Error(message);
    }
  }

  /**
   * Verifica que Siesa haya ACEPTADO el pedido. El wrapper del ERP responde
   * HTTP 200 con `estado: "ok"` aunque Siesa lo rechace: el rechazo viene dentro
   * de `respuesta_siesa` como `<printTipoError>1</printTipoError>` y el detalle
   * en `<f_detalle>`. Si detecta un error, lanza con ese mensaje para que el
   * pedido quede marcado como fallido (y no como "enviado" en falso).
   */
  private assertErpAccepted(data: unknown, context: string): void {
    const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
    const tipo = text.match(/<printTipoError>\s*(\d+)\s*<\/printTipoError>/i);
    if (tipo && Number(tipo[1]) !== 0) {
      const detalle = text.match(/<f_detalle>([^<]*)<\/f_detalle>/i);
      const message = detalle?.[1]?.trim() || 'Siesa rechazó el pedido.';
      throw new Error(`Siesa rechazó el pedido (${context}): ${message}`);
    }
  }

  /**
   * Intenta extraer el consecutivo que Siesa asignó al pedido desde la
   * respuesta de carga. Busca claves habituales (consecutivo, documento, etc.)
   * de forma recursiva y tolerante a mayúsculas/minúsculas.
   */
  private extractConsecutivo(data: unknown): string | undefined {
    const KEYS = [
      'consecutivo',
      'documento',
      'documento_venta',
      'numero',
      'num_docto',
      'numdocto',
      'nro_docto',
      'docto',
    ];

    const visit = (value: unknown): string | undefined => {
      if (value == null) return undefined;
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = visit(item);
          if (found) return found;
        }
        return undefined;
      }
      if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        for (const [key, val] of Object.entries(obj)) {
          if (
            KEYS.includes(key.toLowerCase()) &&
            (typeof val === 'string' || typeof val === 'number')
          ) {
            const str = String(val).trim();
            if (str) return str;
          }
        }
        // Si no estaba en este nivel, se busca en los anidados.
        for (const val of Object.values(obj)) {
          const found = visit(val);
          if (found) return found;
        }
      }
      return undefined;
    };

    return visit(data);
  }

  /**
   * Consulta los estados de los pedidos de una compañía en Siesa.
   * Devuelve todos los pedidos (tipo 1PV) con su estado actual.
   *
   * Usa una caché de corta duración (TTL) y deduplica las peticiones en vuelo,
   * de modo que muchas consultas seguidas (o de varios vendedores a la vez)
   * comparten una sola llamada real al ERP.
   */
  async getOrderStates(companyId: string): Promise<ErpOrderState[]> {
    const now = Date.now();
    const cached = this.statesCache.get(companyId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // Si ya hay una petición en curso para esta compañía, la reutilizamos.
    const inflight = this.statesInflight.get(companyId);
    if (inflight) return inflight;

    const request = this.fetchOrderStates(companyId)
      .then((data) => {
        this.statesCache.set(companyId, {
          data,
          expiresAt: Date.now() + OrdersErpClient.STATES_TTL_MS,
        });
        return data;
      })
      .finally(() => {
        this.statesInflight.delete(companyId);
      });

    this.statesInflight.set(companyId, request);
    return request;
  }

  /** Llamada HTTP real al endpoint de estados (sin caché). */
  private async fetchOrderStates(companyId: string): Promise<ErpOrderState[]> {
    const baseUrl = this.config.get<string>('priceLists.baseUrl');
    const token = this.config.get<string>('priceLists.token');
    const timeout = this.config.get<number>('priceLists.timeoutMs');

    // Los cortes salen como PVA, pero los subproductos entran con su propio
    // tipo de documento (SPB = res, SPP = cerdo). Se consultan todos y se unen
    // para que la sincronización encuentre también los subproductos.
    const docTypes = getOrderDocTypes(companyId);
    try {
      const all: ErpOrderState[] = [];
      for (const tipoDoc of docTypes) {
        const response = await firstValueFrom(
          this.http.get<{ data?: ErpOrderState[] }>(
            `${baseUrl}/pedidos-estados-siesa`,
            {
              params: {
                cia: baseCompanyId(companyId),
                tipo_doc: tipoDoc,
                token,
              },
              timeout,
            },
          ),
        );
        all.push(...(response.data?.data ?? []));
      }
      return all;
    } catch (error) {
      const message = this.describeError(error);
      this.logger.error(`Error consultando estados en el ERP: ${message}`);
      throw new Error(message);
    }
  }

  /** Extrae un mensaje legible del error del ERP. */
  private describeError(error: unknown): string {
    if (error instanceof AxiosError) {
      const data = error.response?.data as unknown;
      if (typeof data === 'string') return data;
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        const detail = obj.message ?? obj.error ?? obj.detail;
        if (typeof detail === 'string') return detail;
        return JSON.stringify(data);
      }
      return error.message;
    }
    return error instanceof Error ? error.message : 'Error desconocido';
  }
}
