import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ProcurementService } from '../application/procurement.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('procurement')
export class ProcurementController {
  constructor(private procurementService: ProcurementService) {}

  @Post('purchase-orders')
  @ApiOperation({ summary: 'Create purchase order' })
  async createPO(@CurrentUser('orgId') orgId: string, @Body() dto: {
    supplierId: string; orderDate: string; expectedDate?: string;
    notes?: string; items: { productId: string; quantity: number; unitPrice: number }[]
  }) {
    return this.procurementService.createPO(orgId, dto)
  }

  @Get('purchase-orders')
  @ApiOperation({ summary: 'List purchase orders' })
  async findAll(
    @CurrentUser('orgId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.procurementService.findAll(orgId, { page, limit, status, supplierId })
  }

  @Get('purchase-orders/:id')
  @ApiOperation({ summary: 'Get purchase order by id' })
  async findById(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.procurementService.findById(orgId, id)
  }

  @Patch('purchase-orders/:id/status')
  @ApiOperation({ summary: 'Update purchase order status (with optimistic locking)' })
  async updateStatus(
    @CurrentUser('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: { status: string; expectedVersion: number },
  ) {
    return this.procurementService.updateStatus(orgId, id, dto.status, dto.expectedVersion)
  }
}
