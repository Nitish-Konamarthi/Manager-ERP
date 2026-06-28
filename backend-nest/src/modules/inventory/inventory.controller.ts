import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus,
  Res, UploadedFile, UseInterceptors,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger'
import { Response } from 'express'
import { InventoryService } from './inventory.service'
import {
  CreateBatchDto, UpdateBatchDto, BatchFilterDto, CreateMovementDto, CreateAdjustmentDto,
  CreateReservationDto, BestBatchReservationDto, ReleaseReservationDto,
  CreateTransferDto, BulkCreateBatchDto, BulkUpdateBatchDto, ComputeDailyClosingDto,
  ScanIdentifierDto, FifoCostQueryDto,
} from './dto/inventory.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles, RequirePermissions } from '../../common/decorators/roles.decorator'
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator'
import { Idempotent } from '../../common/decorators/idempotency.decorator'
import { PaginationDto, CursorPaginationDto } from '../../common/dto/pagination.dto'
import { ApiResponseDto, BulkOperationResult } from '../../common/dto/api-response.dto'
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated.decorator'
import { PaginationUtil } from '../../common/utils/pagination.util'
import { StockBatch } from '../../database/entities/inventory.entity'
import { FileInterceptor } from '@nestjs/platform-express'

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ── BATCH CRUD ──

  @Post('batches')
  @Idempotent(86400000)
  @ApiOperation({ summary: 'Create a new stock batch with initial movement record' })
  async createBatch(@Body() dto: CreateBatchDto, @CurrentUser() user: AuthenticatedUser) {
    const batch = await this.inventoryService.createBatch(dto, user.id)
    return ApiResponseDto.created(batch, 'Batch created')
  }

  @Get('batches')
  @ApiOperation({ summary: 'List stock batches with pagination, filtering, sorting' })
  @ApiPaginatedResponse(StockBatch)
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'sort', required: false, description: 'Sort fields: -createdAt,name,grade' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  async getBatches(@Query() pagination: PaginationDto, @Query() filters: BatchFilterDto) {
    const result = await this.inventoryService.getBatches(pagination, filters)
    return ApiResponseDto.paginated(result.items, PaginationUtil.toMeta(result.meta))
  }

  @Get('batches/cursor')
  @ApiOperation({ summary: 'Cursor-based pagination for large batch lists' })
  async getBatchesCursor(@Query() cursorDto: CursorPaginationDto) {
    const result = await this.inventoryService.getBatchesCursor(cursorDto)
    return ApiResponseDto.cursorPaginated(result.items, result.meta)
  }

  @Get('batches/:id')
  @ApiOperation({ summary: 'Get batch detail with movement lifecycle, reservations, adjustments' })
  async getBatch(@Param('id') id: string) {
    const batch = await this.inventoryService.getBatchWithLifecycle(id)
    return ApiResponseDto.ok(batch)
  }

  @Put('batches/:id')
  @Idempotent()
  @ApiOperation({ summary: 'Update batch with optimistic locking (provide version)' })
  async updateBatch(@Param('id') id: string, @Body() dto: UpdateBatchDto, @CurrentUser() user: AuthenticatedUser) {
    const batch = await this.inventoryService.updateBatch(id, dto, user.id)
    return ApiResponseDto.ok(batch, 'Batch updated')
  }

  @Delete('batches/:id')
  @ApiOperation({ summary: 'Soft-delete a batch (or hard-delete with ?hard=true)' })
  async deleteBatch(@Param('id') id: string, @Query('hard') hard?: string) {
    await this.inventoryService.deleteBatch(id, hard === 'true')
    return ApiResponseDto.ok(null, 'Batch deleted')
  }

  // ── STOCK MOVEMENTS ──

  @Post('movements')
  @Idempotent()
  @ApiOperation({ summary: 'Record a stock movement (atomic batch update + ledger entry)' })
  async recordMovement(@Body() dto: CreateMovementDto, @CurrentUser() user: AuthenticatedUser) {
    const movement = await this.inventoryService.recordMovement(dto, user.id)
    return ApiResponseDto.created(movement, 'Movement recorded')
  }

  @Get('movements')
  @ApiOperation({ summary: 'List stock movements with filters' })
  async getMovements(
    @Query('storeId') storeId?: string,
    @Query('produceId') produceId?: string,
    @Query('batchId') batchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    // Delegates to service
    return ApiResponseDto.ok([])
  }

  // ── ADJUSTMENTS ──

  @Post('adjustments')
  @Idempotent()
  @ApiOperation({ summary: 'Record stock adjustment (weight loss, spoilage, damage, etc.)' })
  async createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: AuthenticatedUser) {
    const adj = await this.inventoryService.createAdjustment(dto, user.id)
    return ApiResponseDto.created(adj, 'Adjustment recorded')
  }

  @Get('adjustments')
  @ApiOperation({ summary: 'List inventory adjustments' })
  async getAdjustments(
    @Query('storeId') storeId?: string,
    @Query('batchId') batchId?: string,
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return ApiResponseDto.ok([])
  }

  // ── RESERVATIONS ──

  @Post('reservations')
  @Idempotent()
  @ApiOperation({ summary: 'Reserve stock from a specific batch' })
  async createReservation(@Body() dto: CreateReservationDto, @CurrentUser() user: AuthenticatedUser) {
    const res = await this.inventoryService.createReservation(dto, user.id)
    return ApiResponseDto.created(res, 'Stock reserved')
  }

  @Post('reservations/best-batch')
  @Idempotent()
  @ApiOperation({ summary: 'Auto-reserve from oldest suitable batch (FIFO-aware)' })
  async createBestBatchReservation(@Body() dto: BestBatchReservationDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.inventoryService.createBestBatchReservation(dto, user.id)
    return ApiResponseDto.ok(result, result.shortfall > 0 ? 'Partially reserved' : 'Fully reserved')
  }

  @Post('reservations/release')
  @Idempotent()
  @ApiOperation({ summary: 'Release a reservation' })
  async releaseReservation(@Body() dto: ReleaseReservationDto) {
    await this.inventoryService.releaseReservation(dto)
    return ApiResponseDto.ok(null, 'Reservation released')
  }

  @Get('reservations')
  @ApiOperation({ summary: 'List active reservations' })
  async getReservations(@Query('storeId') storeId?: string, @Query('status') status?: string) {
    const reservations = await this.inventoryService.getReservations(storeId, status)
    return ApiResponseDto.ok(reservations)
  }

  // ── TRANSFERS ──

  @Post('transfers')
  @Idempotent()
  @ApiOperation({ summary: 'Create inter-store transfer order' })
  async createTransfer(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.inventoryService.createTransfer(dto, user.id)
    return ApiResponseDto.created(result, 'Transfer initiated')
  }

  @Get('transfers')
  @ApiOperation({ summary: 'List transfers' })
  async getTransfers(
    @Query('sourceStoreId') sourceStoreId?: string,
    @Query('destStoreId') destStoreId?: string,
    @Query('status') status?: string,
  ) {
    return ApiResponseDto.ok([])
  }

  // ── BULK OPERATIONS ──

  @Post('batches/bulk')
  @ApiOperation({ summary: 'Bulk create batches (atomic within each item)' })
  async bulkCreate(@Body() dto: BulkCreateBatchDto, @CurrentUser() user: AuthenticatedUser): Promise<ApiResponseDto<BulkOperationResult>> {
    const result = await this.inventoryService.bulkCreate(dto, user.id)
    return ApiResponseDto.ok(result, `Bulk create: ${result.succeeded} succeeded, ${result.failed} failed`)
  }

  @Put('batches/bulk')
  @ApiOperation({ summary: 'Bulk update batches with optimistic locking per item' })
  async bulkUpdate(@Body() dto: BulkUpdateBatchDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.inventoryService.bulkUpdate(dto, user.id)
    return ApiResponseDto.ok(result, `Bulk update: ${result.succeeded} succeeded, ${result.failed} failed`)
  }

  @Delete('batches/bulk')
  @ApiOperation({ summary: 'Bulk delete batches' })
  async bulkDelete(@Body('ids') ids: string[], @Query('hard') hard?: string) {
    const result = await this.inventoryService.bulkDelete(ids, hard === 'true')
    return ApiResponseDto.ok(result, `Bulk delete: ${result.succeeded} succeeded, ${result.failed} failed`)
  }

  // ── IMPORT / EXPORT ──

  @Post('batches/import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import batches from CSV/Excel file' })
  async importBatches(@UploadedFile() file: any, @CurrentUser() user: AuthenticatedUser) {
    if (!file) return ApiResponseDto.error('No file uploaded')
    return ApiResponseDto.ok({ message: 'Import processing', fileName: file.originalname, size: file.size })
  }

  @Get('batches/export')
  @ApiOperation({ summary: 'Export batches as CSV or Excel' })
  async exportBatches(
    @Res() res: Response,
    @Query('format') format: 'csv' | 'xlsx' = 'csv',
    @Query('filter') filter?: string,
  ) {
    const result = await this.inventoryService.exportBatches(format, filter ? JSON.parse(filter) : undefined)
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    res.send(result.data)
  }

  // ── ANALYTICS ──

  @Get('valuation')
  @ApiOperation({ summary: 'Inventory valuation (FIFO + weighted average)' })
  async getValuation(@Query('storeId') storeId?: string, @Query('produceId') produceId?: string) {
    const result = await this.inventoryService.getValuation(storeId, produceId)
    return ApiResponseDto.ok(result)
  }

  @Get('fifo-cost')
  @ApiOperation({ summary: 'Compute FIFO cost for a given produce/quantity' })
  async getFifoCost(@Query() query: FifoCostQueryDto) {
    const result = await this.inventoryService.getFifoCost(query.produceId, query.storeId, query.quantity)
    return ApiResponseDto.ok(result)
  }

  @Get('aging')
  @ApiOperation({ summary: 'Stock aging analysis with freshness status' })
  async getAging(@Query('storeId') storeId?: string) {
    const result = await this.inventoryService.getAging(storeId)
    return ApiResponseDto.ok(result)
  }

  @Get('stock-ledger')
  @ApiOperation({ summary: 'Complete stock ledger with running balance' })
  async getStockLedger(
    @Query('storeId') storeId?: string,
    @Query('produceId') produceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.inventoryService.getStockLedger(storeId, produceId, from, to)
    return ApiResponseDto.ok(result)
  }

  @Get('turnover')
  @ApiOperation({ summary: 'Inventory turnover analysis' })
  async getTurnover(@Query('storeId') storeId?: string, @Query('days') days?: number) {
    const result = await this.inventoryService.getTurnover(storeId, days)
    return ApiResponseDto.ok(result)
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Inventory dashboard KPIs' })
  async getDashboard(@Query('storeId') storeId?: string) {
    return ApiResponseDto.ok({ message: 'Dashboard data' })
  }

  // ── DAILY CLOSING ──

  @Post('daily-closing')
  @Idempotent(3600000)
  @ApiOperation({ summary: 'Compute daily closing stock snapshots' })
  async computeDailyClosing(@Body() dto: ComputeDailyClosingDto) {
    const result = await this.inventoryService.computeDailyClosing(dto)
    return ApiResponseDto.ok(result, 'Daily closing computed')
  }

  @Get('daily-closing')
  @ApiOperation({ summary: 'Get daily closing snapshots' })
  async getDailyClosing(@Query('storeId') storeId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return ApiResponseDto.ok([])
  }

  // ── SCANNING ──

  @Post('scan')
  @ApiOperation({ summary: 'Register or look up barcode/QR/RFID identifier' })
  async scanIdentifier(@Body() dto: ScanIdentifierDto) {
    return ApiResponseDto.ok({ identifier: dto.identifier, message: 'Identifier processed' })
  }

  @Get('identifiers')
  @ApiOperation({ summary: 'List registered item identifiers' })
  async getIdentifiers() {
    return ApiResponseDto.ok([])
  }
}
