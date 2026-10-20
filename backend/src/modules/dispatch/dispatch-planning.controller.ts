import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Between, Not, Repository } from 'typeorm';
import { DeliveryType, Order, OrderStatus } from '../orders/entities/order.entity';
import { DispatchApiKeyGuard } from './dispatch-api-key.guard';

export function pesoItemPlanificacion(item: { quantity: number; unitOfMeasure?: string; productName: string }): { kg: number; estimado: boolean } | null {
  const unidad = String(item.unitOfMeasure ?? '').trim().toUpperCase();
  const cantidad = Number(item.quantity);
  if (['KG', 'KGM', 'KILO', 'KILOGRAMO', 'KILOGRAMOS'].includes(unidad)) return { kg: cantidad, estimado: false };
  if (['G', 'GR', 'GRS', 'GRAMO', 'GRAMOS'].includes(unidad)) return { kg: cantidad / 1000, estimado: false };
  if (!['PK', 'U', 'UN', 'UND', 'UNIDAD', 'UNIDADES', 'PAQ', 'PAQUETE'].includes(unidad)) return null;
  const nombre = String(item.productName ?? '');
  if (/\bX\s*\d+(?:[.,]\d+)?\s*X\s*\d/i.test(nombre)) return null;
  const pesos = [...nombre.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(KILOGRAMOS?|KGS?|GRAMOS?|GRS?|G)\b/gi)];
  if (pesos.length !== 1) return null;
  const valor = Number(pesos[0][1].replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const kgUnidad = pesos[0][2].toUpperCase().startsWith('K') ? valor : valor / 1000;
  return { kg: cantidad * kgUnidad, estimado: true };
}

@Controller('public/dispatch')
@UseGuards(DispatchApiKeyGuard)
export class DispatchPlanningController {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {}

  @Get('planning-orders')
  async list(@Query('fecha') fecha: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '') ||
        !Number.isFinite(Date.parse(`${fecha}T00:00:00Z`)) ||
        new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha) {
      throw new BadRequestException('Fecha invalida: usa YYYY-MM-DD.');
    }
    const inicio = new Date(`${fecha}T06:00:00-05:00`);
    inicio.setUTCDate(inicio.getUTCDate() - 1);
    const fin = new Date(inicio.getTime() + 86400000 - 1);
    const base = { companyId: In(['3', '8']), status: OrderStatus.SYNCED, deliveryType: DeliveryType.DESPACHO };
    const pedidos = await this.orders.find({
      where: [
        { ...base, deliveryDate: fecha },
        { ...base, deliveryDate: IsNull(), createdAt: Between(inicio, fin) },
      ],
      order: { createdAt: 'ASC' },
    });
    const exclusiones = await this.orders.find({
      where: [
        { companyId: In(['3', '8']), status: Not(OrderStatus.SYNCED) },
        { companyId: In(['3', '8']), deliveryType: Not(DeliveryType.DESPACHO) },
        { companyId: In(['3', '8']), deliveryDate: Not(fecha) },
      ],
      select: { id: true, companyId: true, orderNumber: true, secondNumber: true, status: true, deliveryType: true, deliveryDate: true },
      loadEagerRelations: false,
    });
    return {
      version: 2,
      fecha,
      jornada: { desde: inicio.toISOString(), hasta: fin.toISOString(), zona: 'America/Bogota' },
      exclusiones: exclusiones.map((pedido) => ({
        id: pedido.id, origen: pedido.companyId === '3' ? 'AGROPECUARIA' : 'INVERSIONES',
        orderNumber: pedido.orderNumber, secondNumber: pedido.secondNumber ?? null,
        status: pedido.status, deliveryType: pedido.deliveryType, fechaEntrega: pedido.deliveryDate ?? null,
      })),
      pedidos: pedidos.map((pedido) => {
        const pesos = pedido.items.map((item) => ({ item, peso: pesoItemPlanificacion(item) }));
        const sinPeso = pesos.filter(({ peso }) => peso === null).map(({ item }) => item);
        const kg = Math.round(pesos.reduce((total, { peso }) => total + (peso?.kg ?? 0), 0) * 100) / 100;
        return {
          id: pedido.id,
          origen: pedido.companyId === '3' ? 'AGROPECUARIA' : 'INVERSIONES',
          orderNumber: pedido.orderNumber,
          secondNumber: pedido.secondNumber ?? null,
          fechaEntrega: pedido.deliveryDate ?? fecha,
          nit: pedido.customer.code,
          sucursal: pedido.customer.branch,
          cliente: pedido.customer.name,
          nombreSucursal: pedido.customer.branchName ?? '',
          kg,
          canastillas: Math.ceil(kg / 15),
          itemsPesoEstimado: pesos.filter(({ peso }) => peso?.estimado).map(({ item, peso }) => ({ sku: item.sku, kg: Math.round(peso!.kg * 100) / 100 })),
          itemsSinPeso: sinPeso.map((item) => ({ sku: item.sku, unidad: item.unitOfMeasure ?? null, cantidad: Number(item.quantity) })),
        };
      }),
    };
  }
}