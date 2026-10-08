import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseFloatPipe,
  Patch,
  Post,
  Query,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CompanyId } from '../../common/decorators/company-id.decorator';
import {
  buildInventoryTemplate,
  parseInventoryExcel,
} from './inventory.parser';
import { buildStockPdf } from './stock-pdf';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  findAll(
    @CompanyId() companyId: string,
    @Query('search') search?: string,
    @Query('priceList') priceList?: string,
    @Query('type') type = 'corte',
  ) {
    if (priceList) {
      return this.productsService.findSellableForList(
        companyId,
        priceList,
        search,
        type,
      );
    }
    return this.productsService.findAll(companyId, search, type);
  }

  /** Productos con existencias (stock > 0), sin importar lista de precios. */
  @Get('stock')
  findInStock(
    @CompanyId() companyId: string,
    @Query('search') search?: string,
    @Query('priceList') priceList?: string,
  ) {
    if (priceList) {
      return this.productsService.findInStockWithPrices(
        companyId,
        priceList,
        search,
      );
    }
    return this.productsService.findInStock(companyId, search);
  }

  /**
   * PDF de los productos disponibles hoy (en stock) para compartir con
   * clientes. Con `priceList` incluye el precio de esa lista.
   */
  @Get('stock/pdf')
  async stockPdf(
    @CompanyId() companyId: string,
    @Res() res: Response,
    @Query('priceList') priceList?: string,
  ) {
    const products = priceList
      ? await this.productsService.findInStockWithPrices(companyId, priceList)
      : await this.productsService.findInStock(companyId);
    const buffer = await buildStockPdf(companyId, products, Boolean(priceList));
    const today = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      .replace(/\//g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="disponibles-${companyId}-${today}.pdf"`,
    );
    res.send(buffer);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('sync')
  sync(@CompanyId() companyId: string) {
    return this.productsService.syncFromSiesa(companyId);
  }

  /** Descarga la plantilla de inventario (Referencia, Descripción, Stock). */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('template')
  downloadTemplate(@Res() res: Response) {
    const buffer = buildInventoryTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_inventario.xlsx"',
    );
    res.send(buffer);
  }

  /**
   * Carga diaria de inventario desde Excel. Reemplaza el inventario de la
   * compañía con el de la plantilla.
   */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  importInventory(
    @CompanyId() companyId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type = 'corte',
    @Query('species') species?: string,
  ) {
    if (!file) {
      throw new UnsupportedMediaTypeException('No se recibió ningún archivo.');
    }
    const rows = parseInventoryExcel(file.buffer);
    return this.productsService.replaceInventory(companyId, rows, type, species);
  }

  /**
   * Edición de stock (única edición permitida desde la web). Permitida a los
   * administradores y a los usuarios con permiso del módulo de inventario
   * (p. ej. vendedores de MONTERIA TAT habilitados para inventario).
   */
  @Post('manual')
  async createManual(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Body() body: { sku?: string; name?: string; stock?: number | string },
    @Query('type') type = 'corte',
  ) {
    const allowed = await this.usersService.hasPermissionInCompany(
      user.id,
      companyId,
      '/admin/inventario',
    );
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes permiso para editar el inventario.',
      );
    }
    return this.productsService.createManual(
      companyId,
      {
        sku: body?.sku,
        name: body?.name,
        stock: body?.stock != null ? Number(body.stock) : 0,
      },
      type,
    );
  }

  /**
   * Edición individual de un producto (nombre/stock) sin usar cargue masivo.
   */
  @Patch(':id/manual')
  async updateManual(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { name?: string; stock?: number | string },
    @Query('type') type = 'corte',
  ) {
    const allowed = await this.usersService.hasPermissionInCompany(
      user.id,
      companyId,
      '/admin/inventario',
    );
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes permiso para editar el inventario.',
      );
    }
    return this.productsService.updateManual(
      companyId,
      id,
      {
        name: body?.name,
        stock: body?.stock != null ? Number(body.stock) : undefined,
      },
      type,
    );
  }

  @Patch(':id/stock')
  async updateStock(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('stock', ParseFloatPipe) stock: number,
  ) {
    const allowed = await this.usersService.hasPermissionInCompany(
      user.id,
      companyId,
      '/admin/inventario',
    );
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes permiso para editar el inventario.',
      );
    }
    return this.productsService.updateStock(companyId, id, stock);
  }
}
