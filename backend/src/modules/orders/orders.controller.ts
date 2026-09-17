import {
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
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CompanyId } from '../../common/decorators/company-id.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  create(
    @CompanyId() companyId: string,
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.create(companyId, dto, user);
  }

  @Get()
  findMine(
    @CompanyId() companyId: string,
    @CurrentUser('id') sellerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.ordersService.findAllForSeller(companyId, sellerId, {
      from,
      to,
      customerId,
    });
  }

  /** Avisos pendientes para el vendedor (decisiones de cartera). */
  @Get('notifications')
  notifications(@CurrentUser('id') sellerId: string) {
    return this.ordersService.findSellerNotifications(sellerId);
  }

  /** Avisos de cambio de estado en Siesa de los pedidos del vendedor. */
  @Get('siesa-state-notifications')
  siesaStateNotifications(@CurrentUser('id') sellerId: string) {
    return this.ordersService.findSiesaStateNotifications(sellerId);
  }

  /** Estado real en Siesa de los pedidos del vendedor (orderNumber -> estado). */
  @Get('siesa-states')
  siesaStates(
    @CompanyId() companyId: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.ordersService.getSiesaStates(companyId, sellerId);
  }

  /**
   * ¿El cliente ya tiene un pedido creado hoy? El monto mínimo es por día por
   * cliente, así que el frontend usa esto para relajarlo en el segundo pedido.
   */
  @Get('customer-today')
  async customerHasOrderToday(
    @CompanyId() companyId: string,
    @Query('customerId') customerId: string,
  ) {
    const hasOrder = customerId
      ? await this.ordersService.customerHasOrderToday(companyId, customerId)
      : false;
    return { hasOrder };
  }

  /** Vendedores de la compañía (para el selector de subproductos). */
  @Get('sellers')
  sellers(@CompanyId() companyId: string) {
    return this.usersService.getCompanySellers(companyId);
  }

  /** Marca como visto un aviso de cartera del vendedor. */
  @Post(':id/acknowledge')
  acknowledge(
    @CurrentUser('id') sellerId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.acknowledgeNotification(sellerId, id);
  }

  /** Marca como visto un aviso de cambio de estado en Siesa. */
  @Post(':id/siesa-state-ack')
  acknowledgeSiesaState(
    @CurrentUser('id') sellerId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.acknowledgeSiesaStateNotification(sellerId, id);
  }

  @Get(':id')
  async findOne(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.ordersService.assertSellerOwnsOrder(companyId, id, user);
    return this.ordersService.findOne(companyId, id);
  }

  @Patch(':id')
  async update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: User,
  ) {
    await this.ordersService.assertSellerOwnsOrder(companyId, id, user);
    return this.ordersService.update(companyId, id, dto);
  }

  @Post(':id/confirm')
  async confirm(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.ordersService.assertSellerOwnsOrder(companyId, id, user);
    return this.ordersService.confirm(companyId, id);
  }

  @Post(':id/sync')
  async sync(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.ordersService.assertSellerOwnsOrder(companyId, id, user);
    return this.ordersService.syncToSiesa(companyId, id);
  }

  @Post(':id/cancel')
  async cancel(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: User,
  ) {
    await this.ordersService.assertSellerOwnsOrder(companyId, id, user);
    return this.ordersService.cancel(companyId, id, dto.reason);
  }

  @Get(':id/pdf')
  async pdf(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    await this.ordersService.assertSellerOwnsOrder(companyId, id, user);
    const order = await this.ordersService.findOne(companyId, id);
    const buffer = await this.ordersService.generatePdf(
      companyId,
      id,
      user.name,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="pedido-${order.orderNumber}.pdf"`,
    );
    res.send(buffer);
  }
}
