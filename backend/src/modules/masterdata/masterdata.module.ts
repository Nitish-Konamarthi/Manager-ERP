import { Module } from '@nestjs/common'
import { CategoriesService } from './application/categories.service'
import { ProductsService } from './application/products.service'
import { UnitsService } from './application/units.service'
import { MasterdataController } from './presentation/masterdata.controller'

@Module({
  controllers: [MasterdataController],
  providers: [CategoriesService, ProductsService, UnitsService],
  exports: [CategoriesService, ProductsService],
})
export class MasterdataModule {}
