import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { ClientRecord } from './entities/client-record.entity';
import { ClientSellerInfo } from './entities/client-seller-info.entity';
import { ClientsClient, ClientRaw, PortfolioRaw } from './clients.client';
import { SaveClientSellerInfoDto } from './dto/save-client-seller-info.dto';
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
  branchName?: string;
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
  /** Cupo de crédito por sucursal (Siesa maneja el cupo por sucursal). */
  branches: PortfolioBranchCredit[];
  documents: PortfolioDocument[];
}

/** Cupo de crédito de una sucursal del cliente según Siesa. */
export interface PortfolioBranchCredit {
  branch: string;
  branchName?: string;
  creditLimit: number;
  /** Saldo total de la sucursal en cartera. */
  balance: number;
  /** Cupo disponible (cupo - saldo); puede ser negativo. */
  available: number;
  /** Siesa bloquea pedidos que superen el cupo. */
  blocked: boolean;
  tolerancePct: number;
  graceDays: number;
  /** Fecha del cupo (YYYY-MM-DD). */
  creditDate?: string;
  /**
   * `erp`: viene en la consulta actual. `stored`: la sucursal no tiene
   * documentos abiertos y se toma el último cupo guardado (saldo 0).
   */
  source: 'erp' | 'stored';
}

/** Cupo de la sucursal indicada, o `undefined` si no se conoce. */
export function findBranchCredit(
  portfolio: ClientPortfolio,
  branch?: string | null,
): PortfolioBranchCredit | undefined {
  const code = (branch ?? '').trim() || '001';
  return portfolio.branches.find((b) => b.branch === code);
}

/**
 * Indica si un pedido de `amount` haría que la sucursal supere su cupo
 * (incluida la tolerancia). Sin cupo asignado no se valida.
 */
export function exceedsBranchCredit(
  credit: { creditLimit: number; tolerancePct: number } | undefined,
  usedBalance: number,
  amount: number,
): boolean {
  if (!credit || credit.creditLimit <= 0) return false;
  const limit = credit.creditLimit * (1 + credit.tolerancePct / 100);
  return usedBalance + amount > limit;
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectRepository(ClientRecord)
    private readonly repository: Repository<ClientRecord>,
    @InjectRepository(ClientSellerInfo)
    private readonly sellerInfoRepository: Repository<ClientSellerInfo>,
    private readonly client: ClientsClient,
    private readonly dataSource: DataSource,
    private readonly priceListsService: PriceListsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Información de ubicación digitada por este vendedor para este cliente, o
   * `null` si nunca la digitó (así el frontend sabe si debe preguntarla).
   */
  async getSellerInfo(
    companyId: string,
    customerId: string,
    sellerId: string,
  ): Promise<ClientSellerInfo | null> {
    companyId = baseCompanyId(companyId);
    return this.sellerInfoRepository.findOne({
      where: { companyId, customerId, sellerId },
    });
  }

  /** Crea o actualiza la información de ubicación digitada por el vendedor. */
  async saveSellerInfo(
    companyId: string,
    customerId: string,
    sellerId: string,
    dto: SaveClientSellerInfoDto,
  ): Promise<ClientSellerInfo> {
    companyId = baseCompanyId(companyId);
    // Verifica que el cliente exista en esta compañía antes de guardar.
    await this.findOne(companyId, customerId);

    const existing = await this.sellerInfoRepository.findOne({
      where: { companyId, customerId, sellerId },
    });
    const entity = existing ?? this.sellerInfoRepository.create({
      companyId,
      customerId,
      sellerId,
    });
    entity.direccion = dto.direccion.trim();
    entity.referencia = dto.referencia?.trim() || undefined;
    entity.barrio = dto.barrio.trim();
    entity.ciudad = dto.ciudad.trim();
    entity.departamento = dto.departamento?.trim() || undefined;
    entity.telefono = dto.telefono?.trim() || undefined;
    return this.sellerInfoRepository.save(entity);
  }

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
    const branches = await this.resolveBranchCredits(companyId, code, rows);
    const graceOf = new Map(branches.map((b) => [b.branch, b.graceDays]));
    const totalBalance = documents.reduce((sum, d) => sum + d.balance, 0);
    const today = this.bogotaToday();
    const overdueBalance = documents.reduce(
      (sum, d) =>
        d.balance > 0 &&
        this.isOverdue(d.dueDate, today, graceOf.get(d.branch) ?? 0)
          ? sum + d.balance
          : sum,
      0,
    );
    const name = this.clean(rows.find((r) => r.RAZON_SOCIAL)?.RAZON_SOCIAL);
    const branchLimit = branches.reduce(
      (max, b) => Math.max(max, b.creditLimit),
      0,
    );

    return {
      nit: code,
      name,
      count: documents.length,
      totalBalance: Number(totalBalance.toFixed(2)),
      overdueBalance: Number(overdueBalance.toFixed(2)),
      hasOverdue: overdueBalance > 0,
      creditLimit: Math.max(Number(creditLimit) || 0, branchLimit),
      branches,
      documents,
    };
  }

  /**
   * Cupo por sucursal: toma el de la consulta de cartera, lo guarda en
   * `client_records` y, para las sucursales sin documentos abiertos (que no
   * vienen en la consulta), usa el último cupo guardado con saldo 0.
   */
  private async resolveBranchCredits(
    companyId: string,
    code: string,
    rows: PortfolioRaw[],
  ): Promise<PortfolioBranchCredit[]> {
    const fromErp = new Map<string, PortfolioBranchCredit>();
    const sums = new Map<string, number>();
    for (const r of rows) {
      const branch = this.clean(r.SUCURSAL) ?? '001';
      sums.set(branch, (sums.get(branch) ?? 0) + (Number(r.SALDO) || 0));
      if (!fromErp.has(branch)) {
        fromErp.set(branch, this.branchCredit(branch, r));
      }
    }
    for (const [branch, credit] of fromErp) {
      // Si la consulta no trae el saldo de la sucursal, se suma por documento.
      if (Number.isNaN(credit.balance)) {
        credit.balance = Number((sums.get(branch) ?? 0).toFixed(2));
        credit.available = Number(
          (credit.creditLimit - credit.balance).toFixed(2),
        );
      }
    }

    let records: ClientRecord[] = [];
    try {
      records = await this.repository.find({ where: { companyId, code } });
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer los clientes ${code} (compañía ${companyId}): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const now = new Date();
    const updates: Promise<unknown>[] = [];
    const result: PortfolioBranchCredit[] = [];
    for (const credit of fromErp.values()) {
      const record = records.find((r) => r.branch === credit.branch);
      credit.branchName ??= record?.branchName;
      result.push(credit);
      if (record) {
        updates.push(
          this.repository.update(record.id, {
            creditLimit: credit.creditLimit,
            creditBalance: credit.balance,
            creditAvailable: credit.available,
            creditBlocked: credit.blocked,
            creditTolerancePct: credit.tolerancePct,
            creditGraceDays: credit.graceDays,
            creditDate: credit.creditDate ?? null,
            creditUpdatedAt: now,
          }),
        );
      }
    }
    for (const record of records) {
      if (fromErp.has(record.branch) || !record.creditUpdatedAt) continue;
      const limit = Number(record.creditLimit) || 0;
      result.push({
        branch: record.branch,
        branchName: record.branchName,
        creditLimit: limit,
        balance: 0,
        available: limit,
        blocked: record.creditBlocked === true,
        tolerancePct: Number(record.creditTolerancePct) || 0,
        graceDays: Number(record.creditGraceDays) || 0,
        creditDate: record.creditDate ?? undefined,
        source: 'stored',
      });
    }

    if (updates.length > 0) {
      try {
        await Promise.all(updates);
      } catch (error) {
        this.logger.warn(
          `No se pudo guardar el cupo del cliente ${code} ` +
            `(compañía ${companyId}): ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result.sort((a, b) => a.branch.localeCompare(b.branch));
  }

  /** Cupo de la sucursal a partir de una fila de la consulta de cartera. */
  private branchCredit(branch: string, r: PortfolioRaw): PortfolioBranchCredit {
    const limit =
      Number(r.CUPO_CREDITO ?? r.CUPO ?? r.VLR_CUPO ?? r.CUPO_APROBADO ?? 0) ||
      0;
    const rawBalance = r.SALDO_TOTAL_SUCURSAL;
    const balance =
      rawBalance === null || rawBalance === undefined
        ? Number.NaN
        : Number(rawBalance) || 0;
    const rawAvailable = r.CUPO_DISPONIBLE;
    return {
      branch,
      branchName: this.clean(r.DESC_SUCURSAL),
      creditLimit: limit,
      balance,
      available:
        rawAvailable === null || rawAvailable === undefined
          ? limit - balance
          : Number(rawAvailable) || 0,
      blocked: (r.BLOQUEO_CUPO ?? '').trim().toUpperCase() === 'SI',
      tolerancePct: Number(r.PORC_TOLERANCIA) || 0,
      graceDays: Number(r.DIAS_GRACIA) || 0,
      creditDate: this.dateOnly(r.FECHA_CUPO),
      source: 'erp',
    };
  }

  /**
   * Un documento está en mora si su fecha de vencimiento más los días de
   * gracia ya pasó (respecto a hoy, hora de Colombia) y todavía tiene saldo.
   */
  private isOverdue(
    dueDate: string | undefined,
    today: string,
    graceDays = 0,
  ): boolean {
    if (!dueDate) return false;
    const due = dueDate.slice(0, 10);
    if (graceDays <= 0) return due < today;
    const limit = new Date(`${due}T00:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() + graceDays);
    return limit.toISOString().slice(0, 10) < today;
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
      branchName: this.clean(raw.DESC_SUCURSAL),
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
