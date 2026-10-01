import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BajasService } from './bajas.service';
import { CreateBajaDto } from './dto/create-baja.dto';
import { UpdateBajaDto } from './dto/update-baja.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CompanyId } from '../../common/decorators/company-id.decorator';
import { buildBajasReportExcel } from './bajas-excel';

@ApiTags('bajas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/bajas')
export class BajasController {
  constructor(private readonly service: BajasService) {}

  /** Lista las bajas de la compañía, opcionalmente filtradas por año/mes. */
  @Get()
  list(
    @CompanyId() companyId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.service.list(
      companyId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  /** Exporta el informe de bajas completo (datos + resumen tipo dashboard) a Excel. */
  @Get('excel')
  async excel(
    @CompanyId() companyId: string,
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ) {
    const bajas = await this.service.list(
      companyId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
    const buffer = buildBajasReportExcel(bajas);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="informe-bajas.xlsx"',
    );
    res.send(buffer);
  }

  @Post()
  create(@CompanyId() companyId: string, @Body() dto: CreateBajaDto) {
    return this.service.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBajaDto,
  ) {
    return this.service.update(companyId, id, dto);
  }

  @Delete(':id')
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id);
  }
}
