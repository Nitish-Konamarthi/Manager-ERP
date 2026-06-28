import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { InventoryService } from '../application/inventory.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  // ── Dashboard ──

  @Get('dashboard')
  @ApiOperation({ summary: 'Get inventory dashboard stats' })
  async getDashboard(@CurrentUser('orgId') orgId: string) {
    return this.inventoryService.getDashboard(orgId)
  }

  // ── Batches ──

  @Post('batches')
  @ApiOperation({ summary: 'Create a stock batch' })
  async createBatch(
    @CurrentUser() user: { orgId: string; id: string },
    @Body() dto: {
      shopId?: string; productId: string; batchCode: string; receivedDate: string;
      supplierId?: string; purchasePrice: number; sellingPrice?: number;
      receivedQty: number; unitCost: number; grade?: string; location?: string; notes?: string
    },
  ) {
    return this.inventoryService.createBatch(user.orgId, user.id, dto)
  }

  @Get('batches')
  @ApiOperation({ summary: 'List stock batches' })
  async findBatches(
    @CurrentUser('orgId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('productId') productId?: string,
    @Query('shopId') shopId?: string,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.inventoryService.findBatches(orgId, {
      page, limit, search, productId, shopId, status, supplierId, sort, order,
    })
  }

  @Get('batches/:id')
  @ApiOperation({ summary: 'Get batch by ID' })
  async findBatchById(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.inventoryService.findBatchById(orgId, id)
  }

  @Patch('batches/:id')
  @ApiOperation({ summary: 'Update batch metadata' })
  async updateBatch(
    @CurrentUser('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: { sellingPrice?: number; grade?: string; location?: string; notes?: string },
  ) {
    return this.inventoryService.updateBatch(orgId, id, dto)
  }

  // ── Stock Movements ──

  @Get('movements')
  @ApiOperation({ summary: 'List stock movements (ledger)' })
  async findMovements(
    @CurrentUser('orgId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('batchId') batchId?: string,
    @Query('productId') productId?: string,
    @Query('movementType') movementType?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.inventoryService.findMovements(orgId, {
      page, limit, batchId, productId, movementType, fromDate, toDate,
    })
  }

  // ── Adjustments ──

  @Post('adjustments')
  @ApiOperation({ summary: 'Adjust stock quantity (with optimistic locking)' })
  async adjustStock(
    @CurrentUser() user: { orgId: string; id: string },
    @Body() dto: { batchId: string; adjustmentType: string; quantity: number; reason: string; expectedVersion: number },
  ) {
    return this.inventoryService.adjustStock(user.orgId, user.id, dto)
  }

  // ── Reservations ──

  @Post('reservations')
  @ApiOperation({ summary: 'Reserve stock using FIFO allocation' })
  async reserveStock(
    @CurrentUser() user: { orgId: string; id: string },
    @Body() dto: { productId: string; quantity: number; referenceType: string; referenceId: string },
  ) {
    return this.inventoryService.reserveStock(user.orgId, user.id, dto)
  }

  @Post('reservations/:id/release')
  @ApiOperation({ summary: 'Release a stock reservation' })
  async releaseReservation(@CurrentUser('orgId') orgId: string, @Param('id') id: string) {
    return this.inventoryService.releaseReservation(orgId, id)
  }

  // ── Valuation ──

  @Get('valuation')
  @ApiOperation({ summary: 'Get stock valuation (FIFO + Weighted Average)' })
  async getValuation(
    @CurrentUser('orgId') orgId: string,
    @Query('productId') productId?: string,
    @Query('shopId') shopId?: string,
  ) {
    return this.inventoryService.getValuation(orgId, productId, shopId)
  }

  // ── Aging ──

  @Get('aging')
  @ApiOperation({ summary: 'Get stock aging analysis' })
  async getAging(
    @CurrentUser('orgId') orgId: string,
    @Query('productId') productId?: string,
    @Query('shopId') shopId?: string,
  ) {
    return this.inventoryService.getAging(orgId, productId, shopId)
  }

  // ── Daily Closing ──

  @Post('daily-closing')
  @ApiOperation({ summary: 'Run daily stock closing' })
  async closeDaily(
    @CurrentUser('orgId') orgId: string,
    @Body() dto: { date: string; shopId?: string },
  ) {
    return this.inventoryService.closeDaily(orgId, dto.date, dto.shopId)
  }
}
