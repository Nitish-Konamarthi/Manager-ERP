import { Module } from '@nestjs/common'
import { SuppliersService } from './application/suppliers.service'
import { SuppliersController } from './presentation/suppliers.controller'

@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
