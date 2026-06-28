import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { CategoriesService } from '../application/categories.service'
import { ProductsService } from '../application/products.service'
import { UnitsService } from '../application/units.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Master Data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('masterdata')
export class MasterdataController {
  constructor(
    private categoriesService: CategoriesService,
    private productsService: ProductsService,
    private unitsService: UnitsService,
  ) {}

  @Post('categories')
  @ApiOperation({ summary: 'Create category' })
  async createCategory(@CurrentUser('orgId') orgId: string, @Body() dto: {
    name: string; code?: string; parentId?: string; description?: string
  }) {
    return this.categoriesService.create(orgId, dto)
  }

  @Get('categories')
  @ApiOperation({ summary: 'List categories' })
  async findCategories(@CurrentUser('orgId') orgId: string) {
    return this.categoriesService.findAll(orgId)
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get category by id' })
  async findCategory(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.categoriesService.findById(orgId, id)
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  async updateCategory(@CurrentUser('orgId') orgId: string, @Param('id') id: string, @Body() dto: { name?: string; description?: string; parentId?: string }) {
    return this.categoriesService.update(orgId, id, dto)
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete category' })
  async deleteCategory(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    await this.categoriesService.delete(orgId, id)
    return { message: 'Category deleted' }
  }

  @Post('products')
  @ApiOperation({ summary: 'Create product' })
  async createProduct(@CurrentUser('orgId') orgId: string, @Body() dto: {
    categoryId: string; unitId: string; name: string; sku: string; barcode?: string;
    description?: string; hsnCode?: string; taxRate?: number; minStockLevel?: number; maxStockLevel?: number
  }) {
    return this.productsService.create(orgId, dto)
  }

  @Get('products')
  @ApiOperation({ summary: 'List products' })
  async findProducts(
    @CurrentUser('orgId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.productsService.findAll(orgId, { page, limit, search, categoryId })
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by id' })
  async findProduct(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.productsService.findById(orgId, id)
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update product' })
  async updateProduct(@CurrentUser('orgId') orgId: string, @Param('id') id: string, @Body() dto: {
    name?: string; barcode?: string; description?: string; hsnCode?: string;
    taxRate?: number; minStockLevel?: number; maxStockLevel?: number; isActive?: boolean
  }) {
    return this.productsService.update(orgId, id, dto)
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete product' })
  async deleteProduct(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    await this.productsService.delete(orgId, id)
    return { message: 'Product deleted' }
  }

  @Post('units')
  @ApiOperation({ summary: 'Create unit' })
  async createUnit(@CurrentUser('orgId') orgId: string, @Body() dto: { name: string; code: string }) {
    return this.unitsService.create(orgId, dto)
  }

  @Get('units')
  @ApiOperation({ summary: 'List units' })
  async findUnits(@CurrentUser('orgId') orgId: string) {
    return this.unitsService.findAll(orgId)
  }

  @Patch('units/:id')
  @ApiOperation({ summary: 'Update unit' })
  async updateUnit(@CurrentUser('orgId') orgId: string, @Param('id') id: string, @Body() dto: { name?: string; isActive?: boolean }) {
    return this.unitsService.update(orgId, id, dto)
  }
}
