import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { SiesaService } from '../siesa/siesa.service';
import { InventoryRow } from './inventory.parser';
import { PriceListsService } from '../price-lists/price-lists.service';
import { baseCompanyId } from '../../common/companies';

/**
 * Producto vendible para un cliente: proviene de su lista de precios (siempre
 * con precio y unidad de medida) y se enriquece con el stock del inventario.
 */
export interface SellableProduct {
  /** Referencia/SKU del producto. */
  sku: string;
  /** Nombre del producto. */
  name: string;
  /** Precio según la lista de precios del cliente. */
  price: number;
  /** Unidad de medida (KG, U, ...). */
  unitOfMeasure?: string;
  /** Existencia en inventario (0 si no está cargado). */
  stock: number;
  /** Tasa de IVA (%) del producto. El IVA se agrega solo para mostrarlo. */
  taxRate: number;
  /**
   * Categoría/especie del producto (RES, CERDO, CARNES FRIAS, ...). En cortes
   * viene de la SUBCATEGORIA de la lista de precios; en subproductos de la
   * clasificación CERDO/RES del ERP.
   */
  category?: string;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  private static readonly AGRO_COMPANY_ID = '3';

  private normalizeInventoryType(type?: string): 'corte' | 'subproducto' {
    return type === 'subproducto' ? 'subproducto' : 'corte';
  }

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly siesaService: SiesaService,
    private readonly dataSource: DataSource,
    private readonly priceListsService: PriceListsService,
  ) {}

  findAll(companyId: string, search?: string, type = 'corte'): Promise<Product[]> {
    if (search) {
      return this.productsRepository.find({
        where: [
          { companyId, type, name: ILike(`%${search}%`), active: true },
          { companyId, type, sku: ILike(`%${search}%`), active: true },
        ],
        order: { name: 'ASC' },
      });
    }
    return this.productsRepository.find({
      where: { companyId, type, active: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * Productos con existencias (stock > 0) de la compañía, sin importar lista de
   * precios. Es la disponibilidad real para la venta del día. Permite buscar
   * por nombre o SKU. Sin límite de cantidad (se usa para el listado y el PDF).
   */
  async findInStock(companyId: string, search?: string, type = 'corte'): Promise<Product[]> {
    const where = search
      ? [
          { companyId, type, name: ILike(`%${search}%`), active: true },
          { companyId, type, sku: ILike(`%${search}%`), active: true },
        ]
      : { companyId, type, active: true };
    const products = await this.productsRepository.find({
      where,
      order: { name: 'ASC' },
    });
    return products.filter((p) => Number(p.stock) > 0);
  }

  /**
   * Productos en stock con el precio de una lista. Solo se devuelven los que
   * están en la lista elegida (los demás no tienen precio para ese cliente).
   */
  async findInStockWithPrices(
    companyId: string,
    listCode: string,
    search?: string,
  ): Promise<(Product & { price: number })[]> {
    const [products, listItems] = await Promise.all([
      this.findInStock(companyId, search),
      this.priceListsService.findListItemMap(companyId, listCode),
    ]);
    const priced: (Product & { price: number })[] = [];
    for (const p of products) {
      const item = listItems.get(p.sku.trim());
      if (item) priced.push(Object.assign(p, { price: Number(item.price) }));
    }
    return priced;
  }

  /**
   * Catálogo de venta para un cliente: parte de su lista de precios (cada
   * referencia trae nombre, precio y unidad de medida) y se cruza con el
   * inventario para mostrar el stock. Los que tienen stock se muestran
   * primero (prioridad), pero todos son vendibles.
   */
  async findSellableForList(
    companyId: string,
    listCode: string,
    search?: string,
    type = 'corte',
  ): Promise<SellableProduct[]> {
    const items = await this.priceListsService.findItems(
      companyId,
      listCode,
      search,
    );

    // El inventario de subproductos se administra en la compañía base
    // (Agropecuaria); el de cortes es propio de cada compañía.
    const inventoryCompany =
      type === 'subproducto' ? baseCompanyId(companyId) : companyId;
    const inventory = await this.productsRepository.find({
      where: { companyId: inventoryCompany, active: true, type },
      select: { sku: true, stock: true, taxRate: true },
    });
    const stockBySku = new Map(
      inventory.map((p) => [p.sku.trim(), Number(p.stock)]),
    );
    const taxBySku = new Map(
      inventory.map((p) => [p.sku.trim(), Number(p.taxRate)]),
    );

    let sellable: SellableProduct[] = items.map((item) => ({
      sku: item.reference.trim(),
      name: item.productName,
      price: Number(item.price),
      unitOfMeasure: item.unitOfMeasure,
      stock: stockBySku.get(item.reference.trim()) ?? 0,
      taxRate: taxBySku.get(item.reference.trim()) ?? 0,
    }));

    // Subproductos: solo se muestran los que existen en el inventario propio de
    // subproductos (no todo el catálogo de la lista de precios).
    if (type === 'subproducto') {
      sellable = sellable.filter((s) => stockBySku.has(s.sku));
      // Enriquecer con la categoría (CERDO / RES) desde el ERP para dividir el
      // catálogo por especie en la toma de subproductos.
      const categories =
        await this.priceListsService.getSubproductoCategories(companyId);
      for (const s of sellable) {
        s.category = categories.get(s.sku);
      }
    } else {
      // Cortes: se enriquece con la subcategoría (RES / CERDO / ...) del ERP
      // para poder dividir el catálogo por categoría al tomar el pedido.
      const categories =
        await this.priceListsService.getCorteCategories(companyId);
      for (const s of sellable) {
        s.category = categories.get(s.sku);
      }
    }

    // Prioridad: primero los que tienen stock (mayor stock arriba), luego el
    // resto alfabéticamente.
    sellable.sort((a, b) => {
      const aHas = a.stock > 0 ? 1 : 0;
      const bHas = b.stock > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      if (aHas === 1 && a.stock !== b.stock) return b.stock - a.stock;
      return a.name.localeCompare(b.name);
    });

    return sellable;
  }

  findBySiesaId(
    companyId: string,
    siesaId: string,
    type = 'corte',
  ): Promise<Product | null> {
    return this.productsRepository.findOne({ where: { companyId, siesaId, type } });
  }

  /** Sincroniza el catalogo de una compañía desde Siesa (upsert por siesaId). */
  async syncFromSiesa(companyId: string): Promise<{ synced: number }> {
    // Las definiciones (referencias, nombre, precio, IVA) se traen del ERP de la
    // compañía base; el inventario/stock se guarda bajo el id propio (cada
    // compañía —incluida MONTERIA TAT— maneja su propio inventario).
    const raws = await this.siesaService.fetchProducts(baseCompanyId(companyId));
    let synced = 0;

    for (const raw of raws) {
      if (!raw.f120_id) continue;
      const existing = await this.findBySiesaId(companyId, raw.f120_id);
      const product = this.productsRepository.merge(existing ?? new Product(), {
        companyId,
        siesaId: raw.f120_id,
        sku: raw.f120_referencia ?? raw.f120_id,
        name: raw.f120_descripcion ?? 'Sin nombre',
        category: raw.categoria,
        unitOfMeasure: raw.unidad_medida,
        basePrice: Number(raw.precio ?? 0),
        taxRate: Number(raw.iva ?? 0),
        stock: Number(raw.existencia ?? 0),
        active: raw.f120_ind_estado !== '0',
      });
      await this.productsRepository.save(product);
      synced++;
    }

    this.logger.log(
      `Productos sincronizados desde Siesa (compañía ${companyId}): ${synced}`,
    );
    return { synced };
  }

  /**
   * Reemplaza el inventario de una compañía con el de la plantilla Excel.
   *
   * - Los productos del Excel se insertan/actualizan (por referencia).
   * - Los que ya no están en el Excel se eliminan; si tienen pedidos
   *   asociados (FK), se desactivan en lugar de borrarse.
   * - El precio configurado se conserva por referencia (el Excel solo
   *   trae referencia, descripción y stock).
   */
  async replaceInventory(
    companyId: string,
    rows: InventoryRow[],
    type = 'corte',
    species?: string,
  ): Promise<{ total: number; created: number; updated: number; removed: number }> {
    const inventoryType = this.normalizeInventoryType(type);
    await this.validateInventoryImport(companyId, rows, inventoryType);

    // Subproductos por especie: el cargue de Bovino/Porcino reemplaza SOLO su
    // propia especie (no todo el inventario de subproductos). La especie se
    // guarda en `category` de cada fila para poder reemplazar por separado.
    const speciesTag = this.normalizeSpecies(inventoryType, species);
    let categoryMap: Map<string, string> | null = null;
    if (speciesTag) {
      categoryMap =
        await this.priceListsService.getSubproductoCategories(companyId);
      // Se rechaza el archivo si trae referencias que el ERP clasifica como la
      // especie contraria (p. ej. una referencia porcina en el archivo bovino).
      const opposite = speciesTag === 'RES' ? 'CERDO' : 'RES';
      const wrong = rows
        .filter(
          (r) =>
            (categoryMap!.get(r.reference.trim()) ?? '').toUpperCase() ===
            opposite,
        )
        .map((r) => `${r.reference} (fila ${r.rowNumber})`);
      if (wrong.length > 0) {
        const label = speciesTag === 'RES' ? 'Bovino (Res)' : 'Porcino (Cerdo)';
        throw new BadRequestException(
          `El archivo de ${label} contiene referencias que son del otro tipo ` +
            `según el ERP. Revisa: ${this.firstSamples(wrong)}.`,
        );
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Product);
      const existing = await repo.find({ where: { companyId, type: inventoryType } });
      const existingBySku = new Map(existing.map((p) => [p.sku, p]));
      const incomingSkus = new Set(rows.map((r) => r.reference));

      // Alcance del reemplazo: para subproductos por especie, solo las filas de
      // esa especie (por su categoría guardada o, en filas legado sin categoría,
      // por la clasificación del ERP). Así la otra especie no se toca.
      const scopeExisting = speciesTag
        ? existing.filter((p) => {
            const stored = (p.category ?? '').trim().toUpperCase();
            if (stored) return stored === speciesTag;
            return (
              (categoryMap!.get(p.sku.trim()) ?? '').toUpperCase() === speciesTag
            );
          })
        : existing;

      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const prev = existingBySku.get(row.reference);
        if (prev) {
          prev.name = row.description;
          prev.stock = row.stock;
          prev.active = true;
          if (speciesTag) prev.category = speciesTag;
          await repo.save(prev);
          updated++;
        } else {
          const product = repo.create({
            companyId,
            type: inventoryType,
            siesaId: row.reference,
            sku: row.reference,
            name: row.description,
            stock: row.stock,
            basePrice: 0,
            taxRate: 0,
            active: true,
            ...(speciesTag ? { category: speciesTag } : {}),
          });
          await repo.save(product);
          created++;
        }
      }

      // Productos que ya no vienen en la plantilla (solo dentro del alcance).
      const obsolete = scopeExisting.filter((p) => !incomingSkus.has(p.sku));
      let removed = 0;
      for (const product of obsolete) {
        const refRows: Array<{ count: string }> = await manager.query(
          'SELECT COUNT(*)::int AS count FROM order_items WHERE product_id = $1',
          [product.id],
        );
        const referenced = Number(refRows[0]?.count ?? 0);

        if (referenced > 0) {
          // Tiene pedidos: no se puede borrar, se desactiva.
          product.active = false;
          await repo.save(product);
        } else {
          await repo.delete(product.id);
        }
        removed++;
      }

      this.logger.log(
        `Inventario reemplazado (compañía ${companyId}` +
          `${speciesTag ? `, especie ${speciesTag}` : ''}): ` +
          `${created} nuevos, ${updated} actualizados, ${removed} retirados.`,
      );

      return { total: rows.length, created, updated, removed };
    });
  }

  /** Normaliza la especie de subproducto seleccionada al cargar (RES/CERDO). */
  private normalizeSpecies(
    inventoryType: 'corte' | 'subproducto',
    species?: string,
  ): 'RES' | 'CERDO' | null {
    if (inventoryType !== 'subproducto' || !species) return null;
    const s = species.trim().toUpperCase();
    if (s === 'CERDO' || s === 'PORCINO') return 'CERDO';
    if (s === 'RES' || s === 'BOVINO') return 'RES';
    return null;
  }

  private normalizeSku(value: string): string {
    return value.trim().toUpperCase();
  }

  private firstSamples(items: string[], max = 8): string {
    if (items.length <= max) return items.join(', ');
    return `${items.slice(0, max).join(', ')} y ${items.length - max} más`;
  }

  /**
   * Validación de cargue para evitar cruces entre inventarios de cortes y
   * subproductos en AGROPECUARIA.
   */
  private async validateInventoryImport(
    companyId: string,
    rows: InventoryRow[],
    type: 'corte' | 'subproducto',
  ): Promise<void> {
    const mismatchedByColumn = rows.filter(
      (r) => r.inventoryType && r.inventoryType !== type,
    );
    if (mismatchedByColumn.length > 0) {
      const examples = mismatchedByColumn.map(
        (r) => `${r.reference} (fila ${r.rowNumber})`,
      );
      throw new BadRequestException(
        `El archivo contiene filas del tipo opuesto al seleccionado (${type}). ` +
          `Revisa: ${this.firstSamples(examples)}.`,
      );
    }

    // Esta validación aplica al caso crítico reportado (Agropecuaria), donde se
    // administran cortes y subproductos en paralelo.
    if (baseCompanyId(companyId) !== ProductsService.AGRO_COMPANY_ID) {
      return;
    }

    const oppositeType = type === 'corte' ? 'subproducto' : 'corte';
    const [selectedTypeProducts, oppositeTypeProducts] = await Promise.all([
      this.productsRepository.find({
        where: { companyId, type },
        select: { sku: true },
      }),
      this.productsRepository.find({
        where: { companyId, type: oppositeType },
        select: { sku: true },
      }),
    ]);

    const selectedSkus = new Set(
      selectedTypeProducts.map((p) => this.normalizeSku(p.sku)),
    );
    const oppositeSkus = new Set(
      oppositeTypeProducts.map((p) => this.normalizeSku(p.sku)),
    );

    const crossTypeRefs = rows
      .filter((r) => oppositeSkus.has(this.normalizeSku(r.reference)))
      .map((r) => `${r.reference} (fila ${r.rowNumber})`);

    if (crossTypeRefs.length > 0) {
      throw new BadRequestException(
        `Se detectaron referencias del inventario ${oppositeType} en un cargue ${type}. ` +
          `Revisa: ${this.firstSamples(crossTypeRefs)}.`,
      );
    }

    // Si ya hay catálogo base del tipo, no se permiten referencias desconocidas.
    if (selectedSkus.size === 0) return;

    const unknownRefs = rows
      .filter((r) => !selectedSkus.has(this.normalizeSku(r.reference)))
      .map((r) => `${r.reference} (fila ${r.rowNumber})`);

    if (unknownRefs.length > 0) {
      throw new BadRequestException(
        `El archivo contiene referencias que no pertenecen al inventario ${type} de esta compañía. ` +
          `Revisa: ${this.firstSamples(unknownRefs)}. Si son productos nuevos, sincroniza primero el catálogo y vuelve a intentar.`,
      );
    }
  }

  /** Edita únicamente el stock de un producto (única edición permitida en web). */
  async updateStock(
    companyId: string,
    id: string,
    stock: number,
  ): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id, companyId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    product.stock = stock;
    return this.productsRepository.save(product);
  }

  /** Crea un producto manualmente sin necesidad de recargar todo el Excel. */
  async createManual(
    companyId: string,
    input: { sku?: string; name?: string; stock?: number },
    type = 'corte',
  ): Promise<Product> {
    const inventoryType = this.normalizeInventoryType(type);
    const sku = (input.sku ?? '').trim();
    const name = (input.name ?? '').trim();
    const stock = Number(input.stock ?? 0);

    if (!sku) {
      throw new BadRequestException('La referencia es obligatoria.');
    }
    if (!name) {
      throw new BadRequestException('El nombre del producto es obligatorio.');
    }
    if (!Number.isFinite(stock) || stock < 0) {
      throw new BadRequestException('El stock debe ser un número mayor o igual a 0.');
    }

    const existingByType = await this.productsRepository.findOne({
      where: { companyId, sku, type: inventoryType },
    });
    if (existingByType) {
      if (existingByType.active) {
        throw new ConflictException(
          `La referencia ${sku} ya existe en ${inventoryType}.`,
        );
      }
      // Existía pero estaba INACTIVA (p. ej. desactivada por un cargue anterior
      // al no venir en el Excel). En vez de bloquear, se reactiva y se
      // actualizan nombre y stock, para que vuelva a aparecer en el inventario.
      existingByType.name = name;
      existingByType.stock = stock;
      existingByType.active = true;
      return this.productsRepository.save(existingByType);
    }

    const oppositeType = inventoryType === 'corte' ? 'subproducto' : 'corte';
    const existingOpposite = await this.productsRepository.findOne({
      where: { companyId, sku, type: oppositeType },
    });
    if (existingOpposite) {
      throw new BadRequestException(
        `La referencia ${sku} ya existe en ${oppositeType}. No se puede duplicar entre inventarios.`,
      );
    }

    const product = this.productsRepository.create({
      companyId,
      type: inventoryType,
      siesaId: sku,
      sku,
      name,
      stock,
      basePrice: 0,
      taxRate: 0,
      active: true,
    });

    return this.productsRepository.save(product);
  }

  /** Edita un producto individualmente desde la web (sin Excel masivo). */
  async updateManual(
    companyId: string,
    id: string,
    input: { name?: string; stock?: number },
    type = 'corte',
  ): Promise<Product> {
    const inventoryType = this.normalizeInventoryType(type);
    const product = await this.productsRepository.findOne({
      where: { id, companyId, type: inventoryType },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado en el inventario seleccionado.');
    }

    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) {
        throw new BadRequestException('El nombre del producto no puede estar vacío.');
      }
      product.name = name;
    }

    if (input.stock !== undefined) {
      const stock = Number(input.stock);
      if (!Number.isFinite(stock) || stock < 0) {
        throw new BadRequestException('El stock debe ser un número mayor o igual a 0.');
      }
      product.stock = stock;
    }

    return this.productsRepository.save(product);
  }
}
