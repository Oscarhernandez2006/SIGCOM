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
import { DevolucionesService } from './devoluciones.service';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { UpdateDevolucionDto } from './dto/update-devolucion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CompanyId } from '../../common/decorators/company-id.decorator';
import { buildDevolucionesReportExcel } from './devoluciones-excel';

@ApiTags('devoluciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/devoluciones')
export class DevolucionesController {
  constructor(private readonly service: DevolucionesService) {}

  /** Lista las devoluciones de la compañía, opcionalmente filtradas por año/mes. */
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

  /** Exporta el informe de devoluciones completo (datos + resumen tipo dashboard) a Excel. */
  @Get('excel')
  async excel(
    @CompanyId() companyId: string,
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ) {
    const devoluciones = await this.service.list(
      companyId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
    const buffer = buildDevolucionesReportExcel(devoluciones);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="informe-devoluciones.xlsx"',
    );
    res.send(buffer);
  }

  @Post()
  create(@CompanyId() companyId: string, @Body() dto: CreateDevolucionDto) {
    return this.service.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDevolucionDto,
  ) {
    return this.service.update(companyId, id, dto);
  }

  @Delete(':id')
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id);
  }
}
