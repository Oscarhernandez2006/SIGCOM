import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baja } from './entities/baja.entity';
import { BajasController } from './bajas.controller';
import { BajasService } from './bajas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Baja])],
  controllers: [BajasController],
  providers: [BajasService],
  exports: [BajasService],
})
export class BajasModule {}
