import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ClientRecord } from './entities/client-record.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { ClientsClient } from './clients.client';
import { UsersModule } from '../users/users.module';
import { PriceListsModule } from '../price-lists/price-lists.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientRecord]),
    HttpModule,
    ConfigModule,
    UsersModule,
    PriceListsModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService, ClientsClient],
  exports: [ClientsService],
})
export class ClientsModule {}
