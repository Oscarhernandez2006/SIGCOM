import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Devolucion } from './entities/devolucion.entity';
import { DevolucionesController } from './devoluciones.controller';
import { DevolucionesService } from './devoluciones.service';

@Module({
  imports: [TypeOrmModule.forFeature([Devolucion])],
  controllers: [DevolucionesController],
  providers: [DevolucionesService],
  exports: [DevolucionesService],
})
export class DevolucionesModule {}
