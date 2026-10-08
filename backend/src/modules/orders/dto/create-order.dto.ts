import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { DeliveryScheduleDto } from './delivery-schedule.dto';
import { DeliveryType } from '../entities/order.entity';

export class CreateOrderItemDto {
  /** Referencia/SKU del producto en la lista de precios del cliente. */
  @IsString()
  sku: string;

  /** Cantidad: se vende de uno en uno (unidades enteras), mínimo 1. */
  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPct?: number = 0;
}

export class CreateOrderDto {
  @IsUUID()
  customerId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  /** Fecha de entrega elegida por el vendedor (YYYY-MM-DD). */
  @IsDateString()
  deliveryDate: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /** Nota logística del pedido (instrucciones de entrega/transporte). */
  @IsString()
  @IsOptional()
  logisticsNote?: string;

  /** Tipo de entrega: despacho al cliente o recoge en planta. */
  @IsEnum(DeliveryType)
  @IsOptional()
  deliveryType?: DeliveryType;

  /** Horario/días en que el cliente puede recibir la mercancía (texto legible). */
  @IsString()
  @IsOptional()
  deliverySchedule?: string;

  /**
   * Horario de recibido estructurado (rango de días y horas). Se guarda en el
   * cliente para quedar predeterminado en los siguientes pedidos.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryScheduleDto)
  deliveryScheduleData?: DeliveryScheduleDto;

  /**
   * Tipo de pedido: 'corte' (por defecto) o 'subproducto'. Los subproductos
   * usan su propio inventario y un vendedor seleccionado.
   */
  @IsIn(['corte', 'subproducto'])
  @IsOptional()
  orderType?: 'corte' | 'subproducto';

  /**
   * Vendedor al que se asocia el pedido (solo subproductos). Cuando lo sube un
   * remitente, el pedido queda a nombre de este vendedor y con su cédula se
   * carga a Siesa.
   */
  @IsUUID()
  @IsOptional()
  sellerId?: string;

  /**
   * Clave generada por el frontend para esta intención de pedido (misma
   * clave en reintentos tras una conexión lenta/inestable). Si ya existe un
   * pedido con esta clave, se devuelve ese en vez de crear uno nuevo.
   */
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  /**
   * Id de otro pedido del mismo cliente creado hoy al que este se asocia
   * (p. ej. completa un producto que faltó por inventario rotativo en el
   * primer pedido).
   */
  @IsUUID()
  @IsOptional()
  linkedOrderId?: string;
}
