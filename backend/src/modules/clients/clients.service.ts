import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { ClientRecord } from './entities/client-record.entity';
import { ClientsClient, ClientRaw, PortfolioRaw } from './clients.client';
import { PriceListsService } from '../price-lists/price-lists.service';
import { UsersService } from '../users/users.service';
import { baseCompanyId } from '../../common/companies';

/** Cliente normalizado listo para guardar. */
interface NormalizedClient {
  code: string;
  name: string;
  branch: string;
  branchName?: string;
  priceList?: string;
  paymentTerm?: string;
  sellerCode?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  department?: string;
  phone?: string;
  email?: string;
}

/** Documento de cartera (factura pendiente por cobrar) ya normalizado. */
export interface PortfolioDocument {
  branch: string;
  costCenter?: string;
  docType?: string;
  description?: string;
  documentNumber: number;
  /** Fecha de la factura (YYYY-MM-DD). */
  invoiceDate?: string;
  /** Fecha de vencimiento de la factura (YYYY-MM-DD). */
  dueDate?: string;
  debit: number;
  credit: number;
  balance: number;
}

/** Resumen de la cartera de un cliente. */
export interface ClientPortfolio {
  nit: string;
  name?: string;
  count: number;
  totalBalance: number;
  /** Saldo de los documentos ya vencidos (mora). */
  overdueBalance: number;
  /** El cliente tiene al menos un documento vencido con saldo (mora). */
  hasOverdue: boolean;
  /** Cupo de crédito del cliente si el ERP lo provee (0 si se desconoce). */
  creditLimit: number;
  documents: PortfolioDocument[];
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectRepository(ClientRecord)
    private readonly repository: Repository<ClientRecord>,
    private readonly client: ClientsClient,
    private readonly dataSource: DataSource,
    private readonly priceListsService: PriceListsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Devuelve los clientes de una compañía, con búsqueda opcional.
   *
   * Si se pasa `sellerCode`, solo devuelve los clientes asignados a ese
   * vendedor (CODIGO_VENDEDOR). Útil para que cada vendedor vea únicamente
   * su cartera.
   */
  findAll(
    companyId: string,
    search?: string,
    sellerCode?: string,
  ): Promise<ClientRecord[]> {
    companyId = baseCompanyId(companyId);
    const term = search?.trim();
    // Si se pasa `sellerCode` (aunque venga vacío) es porque el llamador quiere
    // filtrar por vendedor: nunca se deben devolver todos los clientes. Solo el
    // admin llama sin `sellerCode` (ve todos).
    const filterBySeller = sellerCode !== undefined;
    const seller = (sellerCode ?? '').trim();
    const base = filterBySeller
      ? { companyId, sellerCode: seller }
      : { companyId };

    const where = term
      ? [
          { ...base, name: ILike(`%${term}%`) },
          { ...base, code: ILike(`%${term}%`) },
        ]
      : base;

    return this.repository
      .find({
        where,
        take: 500,
        order: { name: 'ASC' },
      })
      .then((clients) => this.withPriceListName(companyId, clients));
  }

  /** Devuelve un cliente por id dentro de la compañía. */
  async findOne(companyId: string, id: string): Promise<ClientRecord> {
    companyId = baseCompanyId(companyId);
    const client = await this.repository.findOne({
      where: { id, companyId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    const [withName] = await this.withPriceListName(companyId, [client]);
    return withName;
  }

  /**
   * Rellena el nombre de la lista de precios (DESC_LISTA) de cada cliente a
   * partir del código de lista, para mostrar la descripción en vez del código.
   */
  private async withPriceListName(
    companyId: string,
    clients: ClientRecord[],
  ): Promise<ClientRecord[]> {
    if (clients.length === 0) return clients;
    const [listNames, sellerNames] = await Promise.all([
      this.priceListsService.findListNameMap(companyId),
      this.usersService.getSellerNameMap(companyId),
    ]);
    for (const c of clients) {
      const listCode = c.priceList?.trim();
      if (listCode) c.priceListName = listNames.get(listCode);
      const sellerCode = c.sellerCode?.trim();
      if (sellerCode) c.sellerName = sellerNames.get(sellerCode);
    }
    return clients;
  }

  /**
   * Sincroniza los clientes desde Siesa por lotes (no uno por uno) para que sea
   * rápido contra la base de datos remota, incluso con muchos registros.
   *
   * - Inserta los clientes nuevos.
   * - Actualiza los que cambiaron algún dato.
   * - Elimina los que ya no vienen en la consulta.
   * El endpoint trae filas repetidas; se conserva la última aparición.
   */
  async syncFromSiesa(companyId: string): Promise<{
    created: number;
    updated: number;
    removed: number;
    total: number;
  }> {
    companyId = baseCompanyId(companyId);
    const raws = await this.client.fetchClients(companyId);
    const normalized = this.normalize(raws);
    this.logger.log(
      `Clientes (compañía ${companyId}): ${raws.length} filas recibidas, ${normalized.size} únicas.`,
    );

    const keyOf = (code: string, branch: string) => `${code}::${branch}`;

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientRecord);
      const existing = await repo.find({ where: { companyId } });
      const existingMap = new Map(
        existing.map((e) => [keyOf(e.code, e.branch), e]),
      );
      const incomingKeys = new Set<string>();

      // Solo se escriben filas nuevas o con cambios reales; las demás se
      // omiten para no generar escrituras innecesarias.
      const toWrite: Partial<ClientRecord>[] = [];
      let created = 0;
      let updated = 0;

      for (const row of normalized.values()) {
        const key = keyOf(row.code, row.branch);
        incomingKeys.add(key);
        const prev = existingMap.get(key);

        if (!prev) {
          created += 1;
          toWrite.push({ companyId, ...row });
        } else if (this.hasChanges(prev, row)) {
          updated += 1;
          toWrite.push({ companyId, ...row });
        }
      }

      // Clientes obsoletos (ya no vienen en la consulta).
      const obsoleteIds = existing
        .filter((e) => !incomingKeys.has(keyOf(e.code, e.branch)))
        .map((e) => e.id);

      // No se pueden borrar los que estén referenciados por algún pedido.
      const referenced = await this.referencedClientIds(manager, obsoleteIds);
      const idsToDelete = obsoleteIds.filter((id) => !referenced.has(id));
      const removed = idsToDelete.length;

      if (idsToDelete.length > 0) {
        for (const chunk of this.chunk(idsToDelete, 500)) {
          await repo.delete(chunk);
        }
      }

      // Upsert masivo: una sola consulta por lote (INSERT ... ON CONFLICT DO
      // UPDATE) sobre la llave única (companyId, code, branch). Actualiza en
      // sitio sin romper la llave foránea con los pedidos.
      if (toWrite.length > 0) {
        for (const chunk of this.chunk(toWrite, 500)) {
          await repo.upsert(chunk, {
            conflictPaths: ['companyId', 'code', 'branch'],
            skipUpdateIfNoValuesChanged: true,
          });
        }
      }

      this.logger.log(
        `Clientes sincronizados (compañía ${companyId}): ` +
          `${created} nuevos, ${updated} actualizados, ${removed} eliminados.`,
      );

      return {
        created,
        updated,
        removed,
        total: normalized.size,
      };
    });
  }

  /** Indica si algún campo del cliente cambió respecto a lo guardado. */
  private hasChanges(prev: ClientRecord, row: NormalizedClient): boolean {
    return (
      prev.name !== row.name ||
      (prev.branchName ?? undefined) !== row.branchName ||
      (prev.priceList ?? undefined) !== row.priceList ||
      (prev.paymentTerm ?? undefined) !== row.paymentTerm ||
      (prev.sellerCode ?? undefined) !== row.sellerCode ||
      (prev.address ?? undefined) !== row.address ||
      (prev.neighborhood ?? undefined) !== row.neighborhood ||
      (prev.city ?? undefined) !== row.city ||
      (prev.department ?? undefined) !== row.department ||
      (prev.phone ?? undefined) !== row.phone ||
      (prev.email ?? undefined) !== row.email
    );
  }

  /** Parte un arreglo en lotes de tamaño fijo. */
  private chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, i + size));
    }
    return result;
  }

  /**
   * Devuelve, de un conjunto de ids de cliente, cuáles están referenciados por
   * algún pedido (no se pueden borrar por la llave foránea).
   */
  private async referencedClientIds(
    manager: EntityManager,
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const referenced = new Set<string>();
    for (const chunk of this.chunk(ids, 500)) {
      const rows = await manager
        .createQueryBuilder()
        .select('DISTINCT o.customer_id', 'customerId')
        .from('orders', 'o')
        .where('o.customer_id IN (:...ids)', { ids: chunk })
        .getRawMany<{ customerId: string }>();
      for (const r of rows) referenced.add(r.customerId);
    }
    return referenced;
  }

  /**
   * Limpia y deduplica las filas crudas.
   * El endpoint trae espacios de relleno y códigos repetidos por sucursal;
   * se conserva la última aparición.
   */
  private normalize(raws: ClientRaw[]): Map<string, NormalizedClient> {
    const map = new Map<string, NormalizedClient>();

    for (const raw of raws) {
      const code = (raw.CODIGO ?? '').trim();
      if (!code) continue;
      const branch = (raw.SUCURSAL ?? '').trim() || '001';

      map.set(`${code}::${branch}`, {
        code,
        name: (raw.TERCERO ?? '').trim() || code,
        branch,
        branchName: this.clean(raw.NOMBRE_SUCURSAL),
        priceList: this.clean(raw.LISTA_PRECIO),
        paymentTerm: this.clean(raw.COND_PAGO),
        sellerCode: this.clean(raw.CODIGO_VENDEDOR),
        address: this.clean(raw.DIRECCION),
        neighborhood: this.clean(raw.BARRIO),
        city: this.clean(raw.CIUDAD_MUNICIPIO),
        department: this.clean(raw.DEPARTAMENTO),
        phone: this.clean(raw.CELULAR),
        email: this.clean(raw.EMAIL),
      });
    }

    return map;
  }

  /** Recorta y convierte cadenas vacías en `undefined`. */
  private clean(value?: string | null): string | undefined {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? undefined : trimmed;
  }

  /**
   * Consulta la cartera (documentos por cobrar) de un cliente por su NIT/código
   * en una compañía. Devuelve los documentos y el saldo total pendiente.
   */
  async getPortfolio(companyId: string, nit: string): Promise<ClientPortfolio> {
    companyId = baseCompanyId(companyId);
    const code = nit?.trim();
    if (!code) {
      throw new NotFoundException('Debe indicar el NIT del cliente.');
    }

    const { rows, creditLimit } = await this.client.fetchPortfolio(
      companyId,
      code,
    );
    const documents = rows.map((r) => this.normalizePortfolio(r));
    const totalBalance = documents.reduce((sum, d) => sum + d.balance, 0);
    const today = this.bogotaToday();
    const overdueBalance = documents.reduce(
      (sum, d) =>
        d.balance > 0 && this.isOverdue(d.dueDate, today)
          ? sum + d.balance
          : sum,
      0,
    );
    const name = this.clean(rows.find((r) => r.RAZON_SOCIAL)?.RAZON_SOCIAL);

    return {
      nit: code,
      name,
      count: documents.length,
      totalBalance: Number(totalBalance.toFixed(2)),
      overdueBalance: Number(overdueBalance.toFixed(2)),
      hasOverdue: overdueBalance > 0,
      creditLimit: Number(creditLimit) || 0,
      documents,
    };
  }

  /**
   * Un documento está en mora si su fecha de vencimiento ya pasó (respecto a
   * hoy, hora de Colombia) y todavía tiene saldo por cobrar.
   */
  private isOverdue(dueDate: string | undefined, today: string): boolean {
    if (!dueDate) return false;
    return dueDate.slice(0, 10) < today;
  }

  /** Fecha de hoy (YYYY-MM-DD) en horario de Colombia (America/Bogota). */
  private bogotaToday(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /** Normaliza una fila cruda de cartera (recorta cadenas y asegura números). */
  private normalizePortfolio(raw: PortfolioRaw): PortfolioDocument {
    return {
      branch: this.clean(raw.SUCURSAL) ?? '001',
      costCenter: this.clean(raw.CO),
      docType: this.clean(raw.TIPO_DOC_CRUCE),
      description: this.clean(raw.DESCRIPCION),
      documentNumber: Number(raw.CONS_DOC_CRUCE) || 0,
      invoiceDate: this.dateOnly(raw.FECHA),
      dueDate: this.dateOnly(raw.FECHA_VCTO),
      debit: Number(raw.DEBITO) || 0,
      credit: Number(raw.CREDITO) || 0,
      balance: Number(raw.SALDO) || 0,
    };
  }

  /**
   * Extrae solo la parte de fecha (YYYY-MM-DD) de un valor tipo
   * "2026-06-23T00:00:00". Devuelve undefined si no hay fecha válida.
   */
  private dateOnly(value?: string | null): string | undefined {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 10);
  }
}
