import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DeliveryType, Order, OrderStatus } from '../orders/entities/order.entity';
import { DispatchPlanningController, pesoItemPlanificacion } from './dispatch-planning.controller';

describe('DispatchPlanningController', () => {
  const find = jest.fn();
  const controller = new DispatchPlanningController({ find } as unknown as Repository<Order>);

  beforeEach(() => find.mockReset());

  it('filters only synced dispatch orders for companies 3/8 and the delivery day', async () => {
    find.mockResolvedValue([]);
    await controller.list('2026-10-19');
    const filter = find.mock.calls[0][0];
    for (const where of filter.where) {
      expect(where.status).toBe(OrderStatus.SYNCED);
      expect(where.deliveryType).toBe(DeliveryType.DESPACHO);
      expect(where.companyId.value).toEqual(['3', '8']);
    }
    expect(filter.where[0].deliveryDate).toBe('2026-10-19');
    expect(filter.where[1].deliveryDate.type).toBe('isNull');
    expect(filter.where[1].createdAt.value.map((date: Date) => date.toISOString())).toEqual(['2026-10-18T11:00:00.000Z', '2026-10-19T10:59:59.999Z']);
  });

  it('returns both order references, sums kilograms and flags units without weight', async () => {
    find.mockResolvedValue([{ id: 'uuid', companyId: '8', orderNumber: '000012', secondNumber: '000013', customer: { code: '900', branch: '001', name: 'Cliente' }, items: [{ sku: 'A', unitOfMeasure: 'KG', quantity: '15.50' }, { sku: 'B', unitOfMeasure: ' kg ', quantity: '2.50' }, { sku: 'C', unitOfMeasure: 'U', quantity: '10' }] }]);
    const result = await controller.list('2026-10-19');
    expect(result.pedidos[0]).toMatchObject({ id: 'uuid', origen: 'INVERSIONES', orderNumber: '000012', secondNumber: '000013', kg: 18, canastillas: 2, itemsSinPeso: [{ sku: 'C', unidad: 'U', cantidad: 10 }] });
  });

  it.each(['2026-02-30', '2026-13-01', '19/10/2026', '', undefined])('rejects invalid date %s', async (fecha) => {
    await expect(controller.list(fecha as string)).rejects.toBeInstanceOf(BadRequestException);
    expect(find).not.toHaveBeenCalled();
  });

  it('exports a lightweight historical exclusion list including both references and other delivery dates', async () => {
    find.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'blocked', companyId: '8', orderNumber: '12', secondNumber: '13', status: OrderStatus.CANCELLED, deliveryType: DeliveryType.DESPACHO, deliveryDate: '2026-10-19' }]);
    const result = await controller.list('2026-10-20');
    expect(result.version).toBe(2);
    expect(result.exclusiones[0]).toMatchObject({ origen: 'INVERSIONES', orderNumber: '12', secondNumber: '13', status: 'cancelled' });
    const filter = find.mock.calls[1][0];
    expect(filter.loadEagerRelations).toBe(false);
    expect(filter.where[0].status.value).toBe('synced');
    expect(filter.where[1].deliveryType.value).toBe('despacho');
    expect(filter.where[2].deliveryDate.value).toBe('2026-10-20');
  });

  it.each([
    ['MORTADELA X 500G.', 'PK', 4, 2],
    ['BUTI X 850gr', 'PK', 10, 8.5],
    ['SALCHICHON X 2.8 KG', 'PK', 5, 14],
    ['SALCHICHON X 2,5 KG', 'U', 2, 5],
    ['BUTIPARRILLA X8 UNID (800GR)', 'PK', 10, 8],
    ['CARNE', 'G', 1500, 1.5],
  ])('converts explicit net weights: %s', (productName, unitOfMeasure, quantity, kg) => {
    expect(pesoItemPlanificacion({ productName: String(productName), unitOfMeasure: String(unitOfMeasure), quantity: Number(quantity) })?.kg).toBe(kg);
  });

  it.each(['BUTIFARRA X 32 UND', 'PAQUETE 500 G / 1 KG', 'CAJA X 10 X 500 G'])('does not invent ambiguous/missing package weights: %s', (productName) => {
    expect(pesoItemPlanificacion({ productName, unitOfMeasure: 'PK', quantity: 10 })).toBeNull();
  });
});