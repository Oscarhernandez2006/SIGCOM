import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Baja } from './entities/baja.entity';
import { CreateBajaDto } from './dto/create-baja.dto';
import { UpdateBajaDto } from './dto/update-baja.dto';
import { baseCompanyId } from '../../common/companies';

/** Gestiona los registros del informe de bajas digitados manualmente. */
@Injectable()
export class BajasService {
  constructor(
    @InjectRepository(Baja)
    private readonly repo: Repository<Baja>,
  ) {}

  /** Lista las bajas de la compañía, opcionalmente filtradas por mes/año. */
  list(companyId: string, year?: number, month?: number): Promise<Baja[]> {
    const qb = this.repo
      .createQueryBuilder('b')
      .where('b.company_id = :companyId', { companyId: baseCompanyId(companyId) });
    if (year) {
      qb.andWhere('EXTRACT(YEAR FROM b.fecha) = :year', { year });
    }
    if (month) {
      qb.andWhere('b.mes = :month', { month });
    }
    return qb.orderBy('b.fecha', 'DESC').addOrderBy('b.created_at', 'DESC').getMany();
  }

  async create(companyId: string, dto: CreateBajaDto): Promise<Baja> {
    const baja = this.repo.create({ ...dto, companyId: baseCompanyId(companyId) });
    return this.repo.save(baja);
  }

  async update(companyId: string, id: string, dto: UpdateBajaDto): Promise<Baja> {
    const baja = await this.repo.findOne({
      where: { id, companyId: baseCompanyId(companyId) },
    });
    if (!baja) {
      throw new NotFoundException('Registro de baja no encontrado.');
    }
    Object.assign(baja, dto);
    return this.repo.save(baja);
  }

  async remove(companyId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, companyId: baseCompanyId(companyId) });
    if (!result.affected) {
      throw new NotFoundException('Registro de baja no encontrado.');
    }
  }
}
