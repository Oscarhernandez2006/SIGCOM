import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Devolucion } from './entities/devolucion.entity';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { UpdateDevolucionDto } from './dto/update-devolucion.dto';
import { baseCompanyId } from '../../common/companies';

/** Gestiona los registros del informe de devoluciones digitados manualmente. */
@Injectable()
export class DevolucionesService {
  constructor(
    @InjectRepository(Devolucion)
    private readonly repo: Repository<Devolucion>,
  ) {}

  /** Lista las devoluciones de la compañía, opcionalmente filtradas por mes/año. */
  list(companyId: string, year?: number, month?: number): Promise<Devolucion[]> {
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.company_id = :companyId', { companyId: baseCompanyId(companyId) });
    if (year) {
      qb.andWhere('EXTRACT(YEAR FROM d.fecha) = :year', { year });
    }
    if (month) {
      qb.andWhere('EXTRACT(MONTH FROM d.fecha) = :month', { month });
    }
    return qb.orderBy('d.fecha', 'DESC').addOrderBy('d.created_at', 'DESC').getMany();
  }

  async create(companyId: string, dto: CreateDevolucionDto): Promise<Devolucion> {
    const devolucion = this.repo.create({ ...dto, companyId: baseCompanyId(companyId) });
    return this.repo.save(devolucion);
  }

  async update(companyId: string, id: string, dto: UpdateDevolucionDto): Promise<Devolucion> {
    const devolucion = await this.repo.findOne({
      where: { id, companyId: baseCompanyId(companyId) },
    });
    if (!devolucion) {
      throw new NotFoundException('Registro de devolución no encontrado.');
    }
    Object.assign(devolucion, dto);
    return this.repo.save(devolucion);
  }

  async remove(companyId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, companyId: baseCompanyId(companyId) });
    if (!result.affected) {
      throw new NotFoundException('Registro de devolución no encontrado.');
    }
  }
}
