import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { PriceListItem } from './entities/price-list-item.entity';
import { PriceListsClient, PriceListRaw } from './price-lists.client';
import { bogotaToday } from '../orders/order-cortes';
import { baseCompanyId } from '../../common/companies';

/** Resumen de una lista de precios (sin sus ítems). */
export interface PriceListSummary {
  listCode: string;
  listName: string;
  itemCount: number;
}

@Injectable()
export class PriceListsService {
  private readonly logger = new Logger(PriceListsService.name);

  constructor(
    @InjectRepository(PriceListItem)
    private readonly repository: Repository<PriceListItem>,
    private readonly client: PriceListsClient,
    private readonly dataSource: DataSource,
  ) {}

  /** Mapa `SKU -> categoría` (CERDO / RES) de los subproductos, desde el ERP. */
  getSubproductoCategories(companyId: string): Promise<Map<string, string>> {
    return this.client.fetchSubproductoCategories(baseCompanyId(companyId));
  }

  /** Mapa `SKU -> subcategoría` (RES/CERDO/...) de los cortes, desde el ERP. */
  getCorteCategories(companyId: string): Promise<Map<string, string>> {
    return this.client.fetchCorteCategories(companyId);
  }

  /** Ventas por producto (agregado) del rango, desde el ERP. */
  getVendorProductSales(
    compania: string,
    periodo: string,
    fechaInicio?: string,
    fechaFin?: string,
  ) {
    return this.client.fetchVendorProductSales(
      compania,
      periodo,
      fechaInicio,
      fechaFin,
    );
  }

  /** Ventas GENERALES por vendedor (venta, kilos, costo, margen) del rango. */
  getVendorMonthlySales(
    compania: string,
    periodo: string,
    fechaInicio?: string,
    fechaFin?: string,
  ) {
    return this.client.fetchVendorMonthlySales(
      compania,
      periodo,
      fechaInicio,
      fechaFin,
    );
  }

  /** Lista los nombres de las listas de precios de una compañía. */
  async findLists(companyId: string): Promise<PriceListSummary[]> {
    companyId = baseCompanyId(companyId);
    const rows = await this.repository
      .createQueryBuilder('i')
      .select('i.list_code', 'listCode')
      .addSelect('i.list_name', 'listName')
      .addSelect('COUNT(*)', 'itemCount')
      .where('i.company_id = :companyId', { companyId })
      .groupBy('i.list_code')
      .addGroupBy('i.list_name')
      .orderBy('i.list_code', 'ASC')
      .getRawMany<{ listCode: string; listName: string; itemCount: string }>();

    return rows.map((r) => ({
      listCode: r.listCode,
      listName: r.listName,
      itemCount: Number(r.itemCount),
    }));
  }

  /**
   * Devuelve un mapa `código de lista -> nombre de lista` de una compañía.
   * Se usa para mostrar la descripción de la lista en lugar del código.
   */
  async findListNameMap(companyId: string): Promise<Map<string, string>> {
    companyId = baseCompanyId(companyId);
    const rows = await this.repository
      .createQueryBuilder('i')
      .select('i.list_code', 'listCode')
      .addSelect('i.list_name', 'listName')
      .where('i.company_id = :companyId', { companyId })
      .groupBy('i.list_code')
      .addGroupBy('i.list_name')
      .getRawMany<{ listCode: string; listName: string }>();

    return new Map(rows.map((r) => [r.listCode.trim(), r.listName]));
  }

  /**
   * Devuelve un mapa `referencia -> ítem` de una lista de precios, con todos
   * los datos del producto (nombre, unidad de medida y precio). Se usa para
   * armar el pedido a partir de la lista del cliente.
   */
  async findListItemMap(
    companyId: string,
    listCode: string,
  ): Promise<Map<string, PriceListItem>> {
    companyId = baseCompanyId(companyId);
    const rows = await this.repository.find({
      where: { companyId, listCode },
    });
    return new Map(rows.map((r) => [r.reference.trim(), r]));
  }

  /** Devuelve los ítems de una lista, con búsqueda opcional. */
  findItems(
    companyId: string,
    listCode: string,
    search?: string,
  ): Promise<PriceListItem[]> {
    companyId = baseCompanyId(companyId);
    const where = search
      ? [
          { companyId, listCode, productName: ILike(`%${search}%`) },
          { companyId, listCode, reference: ILike(`%${search}%`) },
        ]
      : { companyId, listCode };

    return this.repository.find({
      where,
      take: 500,
      order: { reference: 'ASC' },
    });
  }

  /**
   * Devuelve TODOS los ítems de una lista (sin tope) para generar el PDF
   * completo de la lista de precios.
   */
  findAllItems(companyId: string, listCode: string): Promise<PriceListItem[]> {
    companyId = baseCompanyId(companyId);
    return this.repository.find({
      where: { companyId, listCode },
      order: { reference: 'ASC' },
    });
  }

  /**
   * Sincroniza las listas de precios desde Siesa.
   *
   * Busca los cambios contra lo guardado en la base de datos:
   * - Inserta las referencias nuevas.
   * - Actualiza el precio/nombre cuando cambió.
   * - Elimina las que ya no vienen en la consulta.
   * El endpoint trae filas repetidas por referencia; se conserva la última.
   *
   * Las operaciones se hacen por lotes (no una por una) para que sea rápido
   * contra la base de datos remota.
   */
  async syncFromSiesa(companyId: string): Promise<{
    lists: number;
    created: number;
    updated: number;
    removed: number;
    total: number;
  }> {
    companyId = baseCompanyId(companyId);
    const raws = await this.client.fetchPriceLists(companyId);
    const normalized = this.normalize(raws);
    this.logger.log(
      `Listas de precios (compañía ${companyId}): ${raws.length} filas recibidas, ${normalized.size} únicas.`,
    );

    const keyOf = (listCode: string, reference: string) =>
      `${listCode}::${reference}`;

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PriceListItem);
      const existing = await repo.find({ where: { companyId } });
      const existingMap = new Map(
        existing.map((e) => [keyOf(e.listCode, e.reference), e]),
      );
      const incomingKeys = new Set<string>();

      const toInsert: Partial<PriceListItem>[] = [];
      const idsToReplace: string[] = []; // filas que cambiaron (se borran y reinsertan)
      let updated = 0;

      for (const row of normalized.values()) {
        const key = keyOf(row.listCode, row.reference);
        incomingKeys.add(key);
        const prev = existingMap.get(key);

        if (!prev) {
          toInsert.push({ companyId, ...row });
        } else if (
          Number(prev.price) !== row.price ||
          prev.productName !== row.productName ||
          prev.listName !== row.listName ||
          prev.unitOfMeasure !== row.unitOfMeasure
        ) {
          idsToReplace.push(prev.id);
          toInsert.push({ companyId, ...row });
          updated++;
        }
      }
      const created = toInsert.length - updated;

      // Filas obsoletas (ya no vienen en la consulta) + las que cambiaron.
      const obsoleteIds = existing
        .filter((e) => !incomingKeys.has(keyOf(e.listCode, e.reference)))
        .map((e) => e.id);
      const removed = obsoleteIds.length;

      const idsToDelete = [...obsoleteIds, ...idsToReplace];
      if (idsToDelete.length > 0) {
        for (const chunk of this.chunk(idsToDelete, 500)) {
          await repo.delete(chunk);
        }
      }

      if (toInsert.length > 0) {
        for (const chunk of this.chunk(toInsert, 500)) {
          await repo.insert(chunk);
        }
      }

      const lists = new Set(
        [...normalized.values()].map((r) => r.listCode),
      ).size;

      this.logger.log(
        `Listas de precios sincronizadas (compañía ${companyId}): ` +
          `${lists} listas, ${created} nuevas, ${updated} actualizadas, ${removed} eliminadas.`,
      );

      return {
        lists,
        created,
        updated,
        removed,
        total: normalized.size,
      };
    });
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
   * Limpia y deduplica las filas crudas.
   * El endpoint trae espacios de relleno y la misma referencia repetida con
   * varios precios (cada uno con su FECHA_ACTIVACION). Por cada referencia se
   * conserva el precio cuya fecha de activación sea la más reciente pero que
   * ya esté vigente (hoy o antes); los precios con activación futura se
   * ignoran. Si una fila no trae fecha, se trata como vigente de respaldo.
   */
  private normalize(raws: PriceListRaw[]): Map<
    string,
    {
      listCode: string;
      listName: string;
      reference: string;
      productName: string;
      unitOfMeasure: string;
      price: number;
    }
  > {
    const map = new Map<
      string,
      {
        listCode: string;
        listName: string;
        reference: string;
        productName: string;
        unitOfMeasure: string;
        price: number;
      }
    >();
    // Fecha de activación elegida por cada referencia, para comparar cuál es
    // la más reciente ya vigente.
    const bestActivation = new Map<string, string>();
    const today = bogotaToday();

    for (const raw of raws) {
      const listCode = (raw.LISTA_PRECIO ?? '').trim();
      const reference = (raw.REFERENCIA ?? '').trim();
      if (!listCode || !reference) continue;

      // Fecha de activación como YYYY-MM-DD. Sin fecha => se trata como muy
      // antigua ('0000-00-00') para que sirva de respaldo pero nunca gane a
      // una fila con fecha real.
      const activation = (raw.FECHA_ACTIVACION ?? '').slice(0, 10);
      // Ignora precios que aún no están vigentes (activación en el futuro).
      if (activation && activation > today) continue;
      const activationForCompare = activation || '0000-00-00';

      const key = `${listCode}::${reference}`;
      const prevActivation = bestActivation.get(key);
      // Conserva la fila con la activación más reciente (a igualdad, la última).
      if (prevActivation !== undefined && prevActivation > activationForCompare) {
        continue;
      }

      bestActivation.set(key, activationForCompare);
      map.set(key, {
        listCode,
        listName: (raw.DESC_LISTA ?? '').trim() || listCode,
        reference,
        productName: (raw.PRODUCTO ?? '').trim() || reference,
        unitOfMeasure: (raw.UM ?? '').trim(),
        price: Number(raw.PRECIO ?? 0),
      });
    }

    return map;
  }
}
