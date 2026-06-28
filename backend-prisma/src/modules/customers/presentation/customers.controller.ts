import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { CustomersService } from '../application/customers.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Create customer' })
  async create(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    return this.customersService.create(orgId, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List customers' })
  async findAll(@CurrentUser('orgId') orgId: string, @Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string) {
    return this.customersService.findAll(orgId, { page, limit, search })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer' })
  async findById(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.customersService.findById(orgId, id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer' })
  async update(@CurrentUser('orgId') orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.customersService.update(orgId, id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete customer' })
  async delete(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    await this.customersService.delete(orgId, id)
    return { message: 'Customer deleted' }
  }
}
