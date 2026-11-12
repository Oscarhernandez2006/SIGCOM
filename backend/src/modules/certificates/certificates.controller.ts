import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CertificatesService } from './certificates.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { certificateCode } from './certificate-pdf';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CompanyId } from '../../common/decorators/company-id.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';

/**
 * Certificados de referencia comercial: se verifican en Siesa la antigüedad,
 * el cupo, el plazo de pago, el comportamiento de pagos y la cartera actual
 * del cliente, y se conserva cada certificado emitido como soporte.
 */
@ApiTags('certificates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}

  /** Clientes de la compañía para elegir a quién certificar. */
  @Get('clients')
  async clients(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Query('search') search?: string,
  ) {
    await this.service.assertCanUse(user, companyId);
    return this.service.searchClients(companyId, search);
  }

  /** Vista previa de los datos verificados en Siesa (no emite nada). */
  @Get('preview')
  async preview(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Query('nit') nit: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    await this.service.assertCanUse(user, companyId);
    return this.service.buildData(companyId, nit, from, to);
  }

  /** Emite el certificado (consecutivo + PDF guardado como soporte). */
  @Post()
  async issue(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Body() dto: IssueCertificateDto,
  ) {
    await this.service.assertCanUse(user, companyId);
    return this.service.issue(companyId, dto, user);
  }

  /** Certificados emitidos en la compañía. */
  @Get()
  async list(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Query('search') search?: string,
  ) {
    await this.service.assertCanUse(user, companyId);
    return this.service.list(companyId, search);
  }

  /** Descarga el PDF guardado de un certificado emitido. */
  @Get(':id/pdf')
  async pdf(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.service.assertCanUse(user, companyId);
    const { cert, pdf } = await this.service.getPdf(companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${certificateCode(cert)}.pdf"`,
    );
    res.send(pdf);
  }
}
