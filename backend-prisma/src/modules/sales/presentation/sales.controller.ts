import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { SalesService } from '../application/sales.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post('orders')
  @ApiOperation({ summary: 'Create sales order' })
  async createSO(@CurrentUser('orgId') orgId: string, @Body() dto: {
    customerId: string; shopId?: string; orderDate: string;
    notes?: string; items: { productId: string; quantity: number; unitPrice: number }[]
  }) {
    return this.salesService.createSO(orgId, dto)
  }

  @Get('orders')
  @ApiOperation({ summary: 'List sales orders' })
  async findAll(
    @CurrentUser('orgId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.salesService.findAll(orgId, { page, limit, status, customerId })
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get sales order by id' })
  async findById(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.salesService.findById(orgId, id)
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Update order status (with optimistic locking)' })
  async updateStatus(
    @CurrentUser('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: { status: string; expectedVersion: number },
  ) {
    return this.salesService.updateStatus(orgId, id, dto.status, dto.expectedVersion)
  }

  @Post('orders/:id/payment')
  @ApiOperation({ summary: 'Record payment against order' })
  async recordPayment(
    @CurrentUser('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: { amount: number },
  ) {
    return this.salesService.recordPayment(orgId, id, dto.amount)
  }
}
