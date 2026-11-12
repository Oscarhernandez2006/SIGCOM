import {
  BadRequestException,
  Body,
  Controller,
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
import { AdminOrdersService } from './admin-orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

/**
 * Descarga masiva de pedidos (solo admin). Lista los pedidos subidos a Siesa
 * (no rebotados ni anulados) y genera un único PDF con los seleccionados,
 * marcándolos como descargados. El admin indica la compañía por query.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  /** Listado administrativo de pedidos con seguimiento completo y filtros. */
  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SELLER,
    UserRole.ALISTADOR,
    UserRole.CARTERA,
    UserRole.FACTURACION,
  )
  listAll(
    @Query('companyId') companyId: string,
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
  ) {
    return this.adminOrdersService.listAll(
      companyId,
      {
        from,
        to,
        status,
        search,
        type,
      },
      user,
    );
  }

  /** Pedidos descargables (subidos a Siesa, no rebotados ni anulados). */
  @Get('downloadable')
  @Roles(UserRole.ADMIN, UserRole.ALISTADOR)
  listDownloadable(
    @Query('companyId') companyId: string,
    @CurrentUser() user: User,
    @Query('type') type?: string,
    @Query('category') category?: string,
  ) {
    return this.adminOrdersService.listDownloadable(
      companyId,
      type,
      user,
      category,
    );
  }

  /** Genera un PDF con los pedidos seleccionados y los marca como descargados. */
  @Post('download')
  @Roles(UserRole.ADMIN, UserRole.ALISTADOR)
  async download(
    @Body()
    body: {
      companyId: string;
      orderIds: string[];
      type?: string;
      category?: string;
    },
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { companyId, orderIds, type, category } = body ?? {};
    if (!companyId) {
      throw new BadRequestException('Falta la compañía.');
    }
    const orderType =
      type === 'subproducto' || type === 'namnam' ? type : 'corte';
    const cat =
      (category ?? '').toUpperCase() === 'RES' ? 'RES' : 'CERDO';
    await this.adminOrdersService.assertCanDownloadType(
      user,
      companyId,
      orderType,
      orderType === 'subproducto' ? cat : undefined,
    );
    const buffer = await this.adminOrdersService.downloadPdf(
      companyId,
      orderIds,
      user.name,
      orderType,
      orderType === 'subproducto' ? cat : undefined,
    );
    res.setHeader('Content-Type', 'application/pdf');
    const suffix =
      orderType === 'subproducto' ? `${orderType}-${cat.toLowerCase()}` : orderType;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="pedidos-${suffix}-${companyId}.pdf"`,
    );
    res.send(buffer);
  }

  /**
   * Marca/desmarca un pedido como alistado. Lo usa el alistador desde la tabla
   * de Descargar pedidos; se guarda automáticamente y la marca persiste.
   */
  @Patch(':id/picked')
  @Roles(UserRole.ADMIN, UserRole.ALISTADOR)
  setPicked(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() body: { picked: boolean },
    @CurrentUser() user: User,
  ) {
    if (!companyId) {
      throw new BadRequestException('Falta la compañía.');
    }
    return this.adminOrdersService.setPicked(
      companyId,
      id,
      !!body?.picked,
      user.name,
    );
  }

  /**
   * Marca/desmarca varios pedidos como alistados de una sola vez (acción
   * masiva: marca todos los pedidos filtrados en la tabla).
   */
  @Patch('picked-bulk')
  @Roles(UserRole.ADMIN, UserRole.ALISTADOR)
  setPickedBulk(
    @Query('companyId') companyId: string,
    @Body() body: { orderIds: string[]; picked: boolean },
    @CurrentUser() user: User,
  ) {
    if (!companyId) {
      throw new BadRequestException('Falta la compañía.');
    }
    return this.adminOrdersService.setPickedBulk(
      companyId,
      body?.orderIds ?? [],
      !!body?.picked,
      user.name,
    );
  }
}
