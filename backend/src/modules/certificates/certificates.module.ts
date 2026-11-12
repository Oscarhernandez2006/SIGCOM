import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CommercialCertificate } from './entities/commercial-certificate.entity';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesClient } from './certificates.client';
import { ClientsModule } from '../clients/clients.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommercialCertificate]),
    HttpModule,
    ConfigModule,
    ClientsModule,
    UsersModule,
  ],
  controllers: [CertificatesController],
  providers: [CertificatesService, CertificatesClient],
})
export class CertificatesModule {}
