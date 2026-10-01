import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { SiesaModule } from './modules/siesa/siesa.module';
import { PriceListsModule } from './modules/price-lists/price-lists.module';
import { ClientsModule } from './modules/clients/clients.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { ProductCostsModule } from './modules/product-costs/product-costs.module';
import { ChannelSalesModule } from './modules/channel-sales/channel-sales.module';
import { CanalOrdersModule } from './modules/canal-orders/canal-orders.module';
import { ProvisioningModule } from './modules/provisioning/provisioning.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { FeaturedProductsModule } from './modules/featured-products/featured-products.module';
import { SeederService } from './database/seeder.service';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    ProductsModule,
    OrdersModule,
    QuotesModule,
    SiesaModule,
    PriceListsModule,
    ClientsModule,
    AdminModule,
    SettingsModule,
    DashboardModule,
    BudgetsModule,
    ProductCostsModule,
    ChannelSalesModule,
    CanalOrdersModule,
    ProvisioningModule,
    DispatchModule,
    FeaturedProductsModule,
  ],
  controllers: [AppController],
  providers: [SeederService],
})
export class AppModule {}
