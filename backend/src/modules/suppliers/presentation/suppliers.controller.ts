import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { SuppliersService } from '../application/suppliers.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: 'Create supplier' })
  async create(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    return this.suppliersService.create(orgId, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List suppliers' })
  async findAll(@CurrentUser('orgId') orgId: string, @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string) {
    return this.suppliersService.findAll(orgId, { page, limit, search })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier' })
  async findById(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.suppliersService.findById(orgId, id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update supplier' })
  async update(@CurrentUser('orgId') orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.suppliersService.update(orgId, id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete supplier' })
  async delete(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    await this.suppliersService.delete(orgId, id)
    return { message: 'Supplier deleted' }
  }
}
