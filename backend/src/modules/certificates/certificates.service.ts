import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CommercialCertificate } from './entities/commercial-certificate.entity';
import { CertificatesClient } from './certificates.client';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { buildCertificatePdf } from './certificate-pdf';
import {
  bogotaToday,
  computeBehavior,
  dateOnly,
  daysBetween,
  earliest,
  monthsBetween,
  normalizeBranches,
  normalizeHistory,
} from './certificates.metrics';
import type { CertificateData } from './certificates.types';
import { ClientsService } from '../clients/clients.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { baseCompanyId } from '../../common/companies';

/** Permiso (módulo) que habilita los certificados. */
export const CERTIFICATES_PERMISSION = '/admin/certificados-referencia';

/** Rango máximo que se puede consultar en el histórico de cartera. */
const MAX_RANGE_MONTHS = 24;

/** Razón social con la que se expide el certificado. */
const COMPANY_NAMES: Record<string, string> = {
  '3': 'AGROPECUARIA SANTACRUZ',
  '8': 'CARNES FRIAS SANTACRUZ',
  MTAT: 'MONTERIA TAT AGROPECUARIA',
};

/** Cliente que se puede certificar (uno por NIT, sin repetir sucursales). */
export interface CertificateClientOption {
  code: string;
  name: string;
  branches: number;
  city?: string;
}

@Injectable()
export class CertificatesService {
  constructor(
    @InjectRepository(CommercialCertificate)
    private readonly repository: Repository<CommercialCertificate>,
    private readonly client: CertificatesClient,
    private readonly clientsService: ClientsService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async assertCanUse(user: User, companyId: string): Promise<void> {
    const ok = await this.usersService.hasPermissionInCompany(
      user.id,
      companyId,
      CERTIFICATES_PERMISSION,
    );
    if (!ok) {
      throw new ForbiddenException(
        'No tienes permiso para los certificados de referencia comercial.',
      );
    }
  }

  /** Clientes de la compañía para elegir a quién certificar. */
  async searchClients(
    companyId: string,
    search?: string,
  ): Promise<CertificateClientOption[]> {
    const records = await this.clientsService.findAll(companyId, search);
    const byCode = new Map<string, CertificateClientOption>();
    for (const r of records) {
      const prev = byCode.get(r.code);
      if (prev) {
        prev.branches += 1;
      } else {
        byCode.set(r.code, {
          code: r.code,
          name: r.name,
          branches: 1,
          city: r.city,
        });
      }
    }
    return [...byCode.values()].slice(0, 50);
  }

  /** Valida el periodo y devuelve las fechas limpias. */
  private validateRange(from: string, to: string): void {
    const valid = (d: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
    if (!valid(from) || !valid(to)) {
      throw new BadRequestException(
        'Indica un periodo válido (desde y hasta).',
      );
    }
    if (from > to) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la final.',
      );
    }
    if (to > bogotaToday()) {
      throw new BadRequestException('La fecha final no puede ser futura.');
    }
    if (monthsBetween(from, to) >= MAX_RANGE_MONTHS) {
      throw new BadRequestException(
        `El periodo no puede superar ${MAX_RANGE_MONTHS} meses.`,
      );
    }
  }

  /**
   * Consulta y verifica en Siesa la información del cliente para el periodo:
   * condiciones comerciales, histórico de pagos y cartera actual.
   */
  async buildData(
    companyId: string,
    nit: string,
    from: string,
    to: string,
  ): Promise<CertificateData> {
    const code = (nit ?? '').trim();
    if (!code) throw new BadRequestException('Indica el NIT del cliente.');
    this.validateRange(from, to);

    const base = baseCompanyId(companyId);
    const [detail, history, portfolio] = await Promise.all([
      this.client.fetchClientDetail(base, code),
      this.client.fetchHistory(base, code, from, to),
      this.clientsService.getPortfolio(companyId, code),
    ]);
    if (detail.length === 0) {
      throw new NotFoundException(
        `El cliente ${code} no está registrado en Siesa para esta compañía.`,
      );
    }

    const today = bogotaToday();
    const branches = normalizeBranches(detail);
    const graceByBranch = new Map(branches.map((b) => [b.branch, b.graceDays]));
    const documents = normalizeHistory(history, graceByBranch);

    const ingreso = earliest(branches.map((b) => b.since));
    const firstInvoice = earliest(
      detail.map((r) => dateOnly(r.FECHA_PRIMERA_FACTURA)),
    );
    const since = ingreso ?? firstInvoice;
    // Siesa repite el cupo del NIT en cada sucursal; sumarlo lo inflaría.
    const totalCreditLimit = branches.reduce(
      (max, b) => Math.max(max, b.creditLimit),
      0,
    );

    const maxDaysOverdue = portfolio.documents.reduce((max, d) => {
      if (d.balance <= 0 || !d.dueDate || d.dueDate >= today) return max;
      return Math.max(max, daysBetween(d.dueDate, today));
    }, 0);

    return {
      company: {
        id: companyId,
        name: COMPANY_NAMES[companyId] ?? COMPANY_NAMES[base] ?? companyId,
      },
      client: {
        code,
        name: (detail[0].TERCERO ?? '').trim() || portfolio.name || code,
        status: branches.some((b) => b.status === 'ACTIVO')
          ? 'ACTIVO'
          : branches[0]?.status,
        since,
        sinceSource: ingreso
          ? 'ingreso'
          : since
            ? 'primera_factura'
            : undefined,
        firstInvoice,
        relationshipMonths: since ? monthsBetween(since, today) : undefined,
        branches,
        totalCreditLimit,
      },
      period: { from, to },
      behavior: computeBehavior(documents),
      current: {
        totalBalance: portfolio.totalBalance,
        overdueBalance: portfolio.overdueBalance,
        maxDaysOverdue,
        openDocuments: portfolio.count,
        creditAvailable: Number(
          (totalCreditLimit - portfolio.totalBalance).toFixed(2),
        ),
      },
      documents,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Emite el certificado: vuelve a verificar los datos en Siesa, asigna el
   * consecutivo de la compañía, genera el PDF y guarda todo como soporte.
   */
  async issue(
    companyId: string,
    dto: IssueCertificateDto,
    user: User,
  ): Promise<CommercialCertificate> {
    const data = await this.buildData(companyId, dto.nit, dto.from, dto.to);

    const saved = await this.dataSource.transaction(async (manager) => {
      // Serializa la numeración por compañía.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `commercial_certificates:${companyId}`,
      ]);
      const row = await manager
        .getRepository(CommercialCertificate)
        .createQueryBuilder('c')
        .select('COALESCE(MAX(c.number), 0)', 'max')
        .where('c.company_id = :companyId', { companyId })
        .getRawOne<{ max: string }>();

      const cert = manager.getRepository(CommercialCertificate).create({
        id: randomUUID(),
        createdAt: new Date(),
        companyId,
        number: Number(row?.max ?? 0) + 1,
        clientCode: data.client.code,
        clientName: data.client.name,
        dateFrom: dto.from,
        dateTo: dto.to,
        addressedTo:
          dto.addressedTo?.trim().toUpperCase() || 'A QUIEN INTERESE',
        notes: dto.notes?.trim() || null,
        issuedById: user.id,
        issuedByName: user.name,
        data,
      });
      cert.pdf = await buildCertificatePdf(cert);
      return manager.getRepository(CommercialCertificate).save(cert);
    });

    // Se devuelve sin el PDF (columna no seleccionada por defecto).
    return this.repository.findOneOrFail({ where: { id: saved.id } });
  }

  /** Certificados emitidos en la compañía (más recientes primero). */
  list(companyId: string, search?: string): Promise<CommercialCertificate[]> {
    const term = search?.trim();
    const where = term
      ? [
          { companyId, clientName: ILike(`%${term}%`) },
          { companyId, clientCode: ILike(`%${term}%`) },
        ]
      : { companyId };
    return this.repository.find({
      where,
      order: { number: 'DESC' },
      take: 200,
    });
  }

  /** PDF guardado de un certificado emitido. */
  async getPdf(
    companyId: string,
    id: string,
  ): Promise<{ cert: CommercialCertificate; pdf: Buffer }> {
    const cert = await this.repository
      .createQueryBuilder('c')
      .addSelect('c.pdf')
      .where('c.id = :id AND c.company_id = :companyId', { id, companyId })
      .getOne();
    if (!cert) throw new NotFoundException('Certificado no encontrado');
    return { cert, pdf: cert.pdf };
  }
}
