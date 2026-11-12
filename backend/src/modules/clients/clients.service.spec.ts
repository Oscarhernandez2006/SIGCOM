import {
  ClientsService,
  exceedsBranchCredit,
  findBranchCredit,
} from './clients.service';
import { ClientsClient, PortfolioRaw } from './clients.client';
import { ClientRecord } from './entities/client-record.entity';

describe('ClientsService.getPortfolio (cupo por sucursal)', () => {
  const row = (over: Partial<PortfolioRaw>): PortfolioRaw => ({
    CODIGO: '900  ',
    RAZON_SOCIAL: 'CLIENTE',
    SUCURSAL: '001',
    DESC_SUCURSAL: 'PRINCIPAL ',
    CONS_DOC_CRUCE: 1,
    FECHA_VCTO: '2000-01-01T00:00:00',
    SALDO: 100,
    CUPO_CREDITO: 250000,
    SALDO_TOTAL_SUCURSAL: 359178,
    CUPO_DISPONIBLE: -109178,
    BLOQUEO_CUPO: 'SI',
    PORC_TOLERANCIA: 10,
    DIAS_GRACIA: 0,
    FECHA_CUPO: '2026-01-15T00:00:00',
    ...over,
  });

  function setup(rows: PortfolioRaw[], records: Partial<ClientRecord>[]) {
    const repository = {
      find: jest.fn().mockResolvedValue(records),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const client = {
      fetchPortfolio: jest.fn().mockResolvedValue({ rows, creditLimit: 0 }),
    } as unknown as ClientsClient;
    const service = new ClientsService(
      repository as never,
      {} as never,
      client,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, repository };
  }

  it('lee el cupo de la sucursal y lo guarda en client_records', async () => {
    const { service, repository } = setup(
      [row({}), row({ CONS_DOC_CRUCE: 2 })],
      [{ id: 'r1', branch: '001' }],
    );

    const p = await service.getPortfolio('4', '900');

    expect(p.branches).toEqual([
      expect.objectContaining({
        branch: '001',
        branchName: 'PRINCIPAL',
        creditLimit: 250000,
        balance: 359178,
        available: -109178,
        blocked: true,
        tolerancePct: 10,
        creditDate: '2026-01-15',
        source: 'erp',
      }),
    ]);
    expect(p.creditLimit).toBe(250000);
    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        creditLimit: 250000,
        creditBalance: 359178,
        creditAvailable: -109178,
        creditBlocked: true,
        creditTolerancePct: 10,
        creditGraceDays: 0,
        creditDate: '2026-01-15',
      }),
    );
  });

  it('usa el último cupo guardado (saldo 0) si la sucursal no tiene documentos', async () => {
    const { service, repository } = setup(
      [],
      [
        {
          id: 'r2',
          branch: '002',
          branchName: 'NORTE',
          creditLimit: 500000,
          creditBlocked: true,
          creditTolerancePct: 0,
          creditGraceDays: 3,
          creditUpdatedAt: new Date(),
        },
        { id: 'r3', branch: '003' },
      ],
    );

    const p = await service.getPortfolio('4', '900');

    expect(p.branches).toEqual([
      expect.objectContaining({
        branch: '002',
        creditLimit: 500000,
        balance: 0,
        available: 500000,
        blocked: true,
        graceDays: 3,
        source: 'stored',
      }),
    ]);
    expect(findBranchCredit(p, '002')?.branchName).toBe('NORTE');
    expect(findBranchCredit(p, '003')).toBeUndefined();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('respeta los días de gracia para la mora', async () => {
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { service } = setup(
      [row({ FECHA_VCTO: `${yesterday}T00:00:00`, DIAS_GRACIA: 5 })],
      [],
    );

    const p = await service.getPortfolio('4', '900');

    expect(p.hasOverdue).toBe(false);
    expect(p.overdueBalance).toBe(0);
  });
});

describe('exceedsBranchCredit', () => {
  it('aplica la tolerancia sobre el cupo', () => {
    const credit = { creditLimit: 1000, tolerancePct: 10 };
    expect(exceedsBranchCredit(credit, 900, 200)).toBe(false);
    expect(exceedsBranchCredit(credit, 900, 201)).toBe(true);
  });

  it('no valida sin cupo asignado', () => {
    expect(
      exceedsBranchCredit({ creditLimit: 0, tolerancePct: 0 }, 1e9, 1),
    ).toBe(false);
    expect(exceedsBranchCredit(undefined, 1e9, 1)).toBe(false);
  });
});
