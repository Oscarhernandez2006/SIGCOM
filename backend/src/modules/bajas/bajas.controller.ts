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
import { BajasService } from './bajas.service';
import { CreateBajaDto } from './dto/create-baja.dto';
import { UpdateBajaDto } from './dto/update-baja.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CompanyId } from '../../common/decorators/company-id.decorator';

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
