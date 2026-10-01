import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DevolucionesService } from './devoluciones.service';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { UpdateDevolucionDto } from './dto/update-devolucion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CompanyId } from '../../common/decorators/company-id.decorator';

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
