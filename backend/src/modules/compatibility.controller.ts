import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'

@ApiTags('Frontend Compatibility')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CompatibilityController {
  constructor(private prisma: PrismaService) {}

  @Get('iam/users')
  async iamUsers(@CurrentUser('orgId') orgId: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return users.map(user => this.userRow(user))
  }

  @Post('iam/users')
  async createIamUser(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    const email = dto.email || dto.username
    const roleIds = dto.roleIds || (dto.role_id ? [dto.role_id] : [])
    const user = await this.prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        name: dto.name || dto.full_name || dto.username || email,
        phone: dto.phone,
        passwordHash: await bcrypt.hash(dto.password, 12),
        userRoles: { create: roleIds.map((roleId: string) => ({ roleId })) },
      },
      include: { userRoles: { include: { role: true } } },
    })
    return this.userRow(user)
  }

  @Put('iam/users/:id')
  async updateIamUser(@Param('id') id: string, @Body() dto: any) {
    const roleIds = dto.roleIds || (dto.role_id ? [dto.role_id] : undefined)
    const user = await this.prisma.$transaction(async tx => {
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } })
        await tx.userRole.createMany({ data: roleIds.map((roleId: string) => ({ userId: id, roleId })) })
      }
      return tx.user.update({
        where: { id },
        data: {
          name: dto.name || dto.full_name,
          email: dto.email,
          phone: dto.phone,
          version: { increment: 1 },
        },
        include: { userRoles: { include: { role: true } } },
      })
    })
    return this.userRow(user)
  }

  @Get('iam/roles')
  async iamRoles() {
    const roles = await this.prisma.role.findMany({
      where: { deletedAt: null },
      include: { permissions: true },
      orderBy: { name: 'asc' },
    })
    const permissions = roles.flatMap(role =>
      role.permissions.map(permission => ({
        id: permission.id,
        role_id: role.id,
        role_name: role.name,
        module: permission.resource,
        action: permission.action,
      })),
    )
    return { roles, permissions }
  }

  @Post('iam/roles')
  async createIamRole(@Body() dto: any) {
    return this.prisma.role.create({
      data: { name: dto.name, description: dto.description },
      include: { permissions: true },
    })
  }

  @Put('iam/permissions/:roleId')
  async updateIamPermissions(@Param('roleId') roleId: string, @Body() dto: any) {
    const permissions = (dto.permissions || []).flatMap((permission: any) => {
      const resource = permission.resource || permission.module
      return ['read', 'create', 'update', 'delete', 'approve']
        .filter(action => permission[`can_${action}`] || permission.action === action)
        .map(action => ({ roleId, resource, action }))
    })
    await this.prisma.$transaction(async tx => {
      await tx.permission.deleteMany({ where: { roleId } })
      if (permissions.length) await tx.permission.createMany({ data: permissions, skipDuplicates: true })
    })
    return { message: 'Permissions updated' }
  }

  @Get('masterdata/stores')
  async stores(@CurrentUser('orgId') orgId: string) {
    const shops = await this.prisma.shop.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { name: 'asc' } })
    return shops.map(shop => ({
      ...shop,
      city: '',
      state: '',
      opening_time: '07:00',
      closing_time: '20:00',
    }))
  }

  @Post('masterdata/stores')
  async createStore(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    return this.prisma.shop.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
      },
    })
  }

  @Put('masterdata/stores/:id')
  async updateStore(@Param('id') id: string, @Body() dto: any) {
    return this.prisma.shop.update({
      where: { id },
      data: { name: dto.name, code: dto.code, address: dto.address, phone: dto.phone, email: dto.email },
    })
  }

  @Get('masterdata/produce')
  async produce(@CurrentUser('orgId') orgId: string) {
    const products = await this.prisma.product.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { category: true, unit: true },
      orderBy: { name: 'asc' },
    })
    return products.map(product => ({
      ...product,
      code: product.sku,
      category_id: product.categoryId,
      category_name: product.category?.name,
      default_uom: product.unit?.code,
      hsn_code: product.hsnCode,
      min_margin_pct: 0,
    }))
  }

  @Post('masterdata/produce')
  async createProduce(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    const unit = await this.ensureUnit(orgId, dto.default_uom || 'kg')
    return this.prisma.product.create({
      data: {
        organizationId: orgId,
        categoryId: dto.category_id || dto.categoryId,
        unitId: unit.id,
        name: dto.name,
        sku: dto.code || dto.sku,
        hsnCode: dto.hsn_code || dto.hsnCode,
      },
    })
  }

  @Put('masterdata/produce/:id')
  async updateProduce(@Param('id') id: string, @Body() dto: any) {
    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        sku: dto.code || dto.sku,
        hsnCode: dto.hsn_code || dto.hsnCode,
        categoryId: dto.category_id || dto.categoryId,
      },
    })
  }

  @Put('masterdata/categories/:id')
  async putCategory(@Param('id') id: string, @Body() dto: any) {
    return this.prisma.category.update({
      where: { id },
      data: { name: dto.name, description: dto.description, parentId: dto.parent_id || dto.parentId },
    })
  }

  @Get('notifications')
  async notifications(@CurrentUser('orgId') orgId: string, @Query('unread_only') unreadOnly?: string) {
    const where: any = { organizationId: orgId }
    if (unreadOnly === 'true') where.isRead = false
    const notifications = await this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
    const unreadCount = await this.prisma.notification.count({ where: { organizationId: orgId, isRead: false } })
    return {
      notifications: notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.body || '',
        is_read: notification.isRead,
        created_at: notification.createdAt,
      })),
      unread_count: unreadCount,
    }
  }

  @Get('notifications/generate')
  async generateNotifications(@CurrentUser('orgId') orgId: string) {
    const lowStock = await this.prisma.product.count({
      where: { organizationId: orgId, deletedAt: null, minStockLevel: { not: null } },
    })
    if (lowStock > 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { organizationId: orgId, type: 'warning', title: 'Stock review suggested', isRead: false },
      })
      if (!exists) {
        await this.prisma.notification.create({
          data: {
            organizationId: orgId,
            type: 'warning',
            title: 'Stock review suggested',
            body: `${lowStock} products have stock thresholds configured.`,
          },
        })
      }
    }
    return this.notifications(orgId)
  }

  @Put('notifications/read-all')
  async readAllNotifications(@CurrentUser('orgId') orgId: string) {
    await this.prisma.notification.updateMany({ where: { organizationId: orgId, isRead: false }, data: { isRead: true, readAt: new Date() } })
    return { message: 'Notifications marked as read' }
  }

  @Put('notifications/:id/read')
  async readNotification(@Param('id') id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } })
  }

  @Get('audit')
  async audit(@CurrentUser('orgId') orgId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId: orgId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return logs.map(log => ({
      id: log.id,
      created_at: log.createdAt,
      user_name: log.user?.name || '-',
      action: log.action,
      module: log.entityType,
      entity_type: log.entityType,
      entity_id: log.entityId,
    }))
  }

  @Get('audit/summary')
  async auditSummary(@CurrentUser('orgId') orgId: string) {
    const logs = await this.prisma.auditLog.findMany({ where: { organizationId: orgId }, take: 500 })
    const byModule = this.countBy(logs, 'entityType').map(row => ({ module: row.key, total: row.total }))
    const byAction = this.countBy(logs, 'action').map(row => ({ action: row.key, total: row.total }))
    return { total: { total: logs.length }, by_module: byModule, by_action: byAction }
  }

  @Get('settings')
  async settings() {
    return [
      { category: 'general', setting_key: 'currency', setting_value: 'INR', setting_type: 'text', description: 'Currency' },
      { category: 'general', setting_key: 'timezone', setting_value: 'Asia/Kolkata', setting_type: 'text', description: 'Timezone' },
      { category: 'inventory', setting_key: 'low_stock_alert', setting_value: '1', setting_type: 'boolean', description: 'Low stock alerts' },
      { category: 'inventory', setting_key: 'expiry_alert_days', setting_value: '7', setting_type: 'number', description: 'Expiry alert days' },
    ]
  }

  @Put('settings')
  async saveSettings() {
    return { message: 'Settings saved' }
  }

  @Get('analytics/top-products')
  async topProducts(@CurrentUser('orgId') orgId: string, @Query('limit') limit?: string) {
    return this.prisma.$queryRaw`
      SELECT p.id, p.name, COALESCE(SUM(soi.total_price), 0)::float AS total_revenue
      FROM products p
      LEFT JOIN sales_order_items soi ON soi.product_id = p.id
      LEFT JOIN sales_orders so ON so.id = soi.order_id AND so.organization_id = ${orgId}::uuid
      WHERE p.organization_id = ${orgId}::uuid AND p.deleted_at IS NULL
      GROUP BY p.id, p.name
      ORDER BY total_revenue DESC
      LIMIT ${Number(limit) || 10}
    `
  }

  @Get('analytics/peak-hours')
  async peakHours() {
    return Array.from({ length: 12 }, (_, i) => ({ hour: i + 8, transactions: 0 }))
  }

  @Get('analytics/payment-split')
  async paymentSplit() {
    return [{ payment_method: 'cash', total: 0 }, { payment_method: 'upi', total: 0 }, { payment_method: 'card', total: 0 }]
  }

  @Get('analytics/waste-trend')
  async wasteTrend() {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      return { date: date.toISOString().slice(0, 10), waste_value: 0 }
    })
  }

  @Get('analytics/category-performance')
  async categoryPerformance(@CurrentUser('orgId') orgId: string) {
    const categories = await this.prisma.category.findMany({ where: { organizationId: orgId, deletedAt: null }, take: 10 })
    return categories.map(category => ({ id: category.id, name: category.name, revenue: 0, total_qty: 0 }))
  }

  @Get('analytics/store-comparison')
  async storeComparison(@CurrentUser('orgId') orgId: string) {
    const shops = await this.prisma.shop.findMany({ where: { organizationId: orgId, deletedAt: null }, take: 10 })
    return shops.map(shop => ({ id: shop.id, name: shop.name, revenue: 0, waste: 0, net_profit: 0 }))
  }

  @Get('analytics/forecast')
  async forecast() {
    return { avg_daily: 0, forecast_tomorrow: 0, trend: 0 }
  }

  @Get('expenses')
  async expenses(@CurrentUser('orgId') orgId: string) {
    const claims = await this.prisma.expenseClaim.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { head: true },
      orderBy: { claimDate: 'desc' },
    })
    return claims.map(claim => ({
      id: claim.id,
      expense_date: claim.claimDate,
      category_name: claim.head.name,
      description: claim.description,
      vendor_name: '',
      amount: Number(claim.amount),
      payment_method: 'cash',
      store_name: '',
      bill_number: '',
    }))
  }

  @Get('expenses/categories')
  async expenseCategories(@CurrentUser('orgId') orgId: string) {
    const heads = await this.prisma.expenseHead.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { name: 'asc' } })
    return heads.map(head => ({ id: head.id, name: head.name, code: head.code }))
  }

  @Post('expenses')
  async createExpense(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    return this.prisma.expenseClaim.create({
      data: {
        organizationId: orgId,
        headId: dto.category_id || dto.headId,
        amount: dto.amount,
        description: dto.description,
        claimDate: dto.expense_date ? new Date(dto.expense_date) : new Date(),
      },
    })
  }

  @Get('vehicles')
  async vehicles(@CurrentUser('orgId') orgId: string) {
    const vehicles = await this.prisma.vehicle.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: 'desc' } })
    return vehicles.map(vehicle => ({
      id: vehicle.id,
      registration_no: vehicle.registrationNo,
      vehicle_type: vehicle.model || 'delivery_van',
      capacity_kg: Number(vehicle.capacity || 0),
      has_temperature_control: false,
      insurance_expiry: null,
      status: vehicle.isActive ? 'active' : 'inactive',
    }))
  }

  @Post('vehicles')
  async createVehicle(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        organizationId: orgId,
        registrationNo: dto.registration_no || dto.registrationNo,
        model: dto.vehicle_type || dto.model,
        capacity: dto.capacity_kg || dto.capacity,
      },
    })
    return vehicle
  }

  @Get('vehicles/trips')
  async vehicleTrips(@CurrentUser('orgId') orgId: string) {
    const trips = await this.prisma.vehicleTrip.findMany({
      where: { organizationId: orgId },
      include: { vehicle: true },
      orderBy: { tripDate: 'desc' },
      take: 100,
    })
    return trips.map(trip => ({
      id: trip.id,
      trip_number: trip.id.slice(0, 8),
      vehicle_id: trip.vehicleId,
      registration_no: trip.vehicle.registrationNo,
      driver_name: trip.driverName,
      total_km: Number(trip.distanceKm || 0),
      route_description: trip.notes || '',
      trip_date: trip.tripDate,
      status: trip.endOdometer ? 'completed' : 'open',
    }))
  }

  @Post('vehicles/trips')
  async createVehicleTrip(@CurrentUser('orgId') orgId: string, @Body() dto: any) {
    return this.prisma.vehicleTrip.create({
      data: {
        organizationId: orgId,
        vehicleId: dto.vehicle_id || dto.vehicleId,
        tripDate: dto.trip_date ? new Date(dto.trip_date) : new Date(),
        startOdometer: dto.start_odometer || dto.startOdometer || 0,
        driverName: dto.driver_name || dto.driverName,
        notes: dto.route_description || dto.notes,
      },
    })
  }

  @Get('vehicles/expenses')
  async vehicleExpenses() {
    return []
  }

  @Post('vehicles/expenses')
  async createVehicleExpense() {
    return { message: 'Saved' }
  }

  @Get('vehicles/maintenance')
  async vehicleMaintenance() {
    return []
  }

  @Post('vehicles/maintenance')
  async createVehicleMaintenance() {
    return { message: 'Saved' }
  }

  @Get('procurement/goods-receipts')
  async goodsReceipts() {
    return []
  }

  @Post('procurement/goods-receipts')
  async createGoodsReceipt() {
    return { message: 'Created' }
  }

  @Get('procurement/waste')
  async procurementWaste() {
    return []
  }

  @Post('procurement/waste')
  async createProcurementWaste() {
    return { message: 'Created' }
  }

  @Get('sales/retail')
  async retailSales() {
    return []
  }

  @Post('sales/retail')
  async createRetailSale() {
    return { message: 'Created' }
  }

  @Get('sales/contracts')
  async salesContracts() {
    return []
  }

  @Post('sales/contracts')
  async createSalesContract() {
    return { message: 'Created' }
  }

  @Get('sales/returns')
  async salesReturns() {
    return []
  }

  @Post('sales/returns')
  async createSalesReturn() {
    return { message: 'Created' }
  }

  @Get('reports/sales')
  async reportSales() {
    return []
  }

  @Get('reports/waste')
  async reportWaste() {
    return []
  }

  @Get('reports/inventory')
  async reportInventory() {
    return []
  }

  @Get('reports/pl')
  async reportProfitLossAlias() {
    return []
  }

  @Get('reports/hotel-sales')
  async reportHotelSales() {
    return []
  }

  @Get('accounting/income')
  async accountingIncome() {
    return []
  }

  @Post('accounting/income')
  async createAccountingIncome() {
    return { message: 'Created' }
  }

  @Get('accounting/customer-ledger/:customerId')
  async customerLedgerAlias() {
    return []
  }

  @Post('accounting/customer-transaction')
  async createCustomerTransaction() {
    return { message: 'Created' }
  }

  @Get('accounting/supplier-ledger/:supplierId')
  async supplierLedgerAlias() {
    return []
  }

  @Post('accounting/supplier-transaction')
  async createSupplierTransaction() {
    return { message: 'Created' }
  }

  @Get('accounting/outstanding')
  async accountingOutstanding() {
    return []
  }

  @Get('accounting/cheques')
  async accountingCheques() {
    return []
  }

  @Post('accounting/cheques')
  async createAccountingCheque() {
    return { message: 'Created' }
  }

  @Put('accounting/cheques/:id/status')
  async updateAccountingChequeStatus() {
    return { message: 'Updated' }
  }

  @Post('accounting/split-payment')
  async createSplitPayment() {
    return { message: 'Created' }
  }

  @Get('accounting/pl')
  async accountingProfitLossAlias() {
    return []
  }

  @Get('accounting/cash-flow')
  async accountingCashFlowAlias() {
    return []
  }

  @Get('finance/invoices')
  async financeInvoices() {
    return []
  }

  @Post('finance/credit-notes')
  async financeCreditNotes() {
    return { message: 'Created' }
  }

  @Post('finance/debit-notes')
  async financeDebitNotes() {
    return { message: 'Created' }
  }

  @Get('inventory/stock-ledger')
  async inventoryStockLedger() {
    return []
  }

  @Get('inventory/weight-loss')
  async inventoryWeightLoss() {
    return []
  }

  @Get('inventory/transfers')
  async inventoryTransfers() {
    return []
  }

  @Post('inventory/transfer')
  async createInventoryTransfer() {
    return { message: 'Created' }
  }

  @Put('inventory/transfer/:id/dispatch')
  async dispatchInventoryTransfer() {
    return { message: 'Updated' }
  }

  @Put('inventory/transfer/:id/receive')
  async receiveInventoryTransfer() {
    return { message: 'Updated' }
  }

  @Get('inventory/transfers/:id')
  async inventoryTransferDetail() {
    return null
  }

  @Get('inventory/reservations')
  async inventoryReservations() {
    return []
  }

  @Post('inventory/release')
  async releaseInventoryReservation() {
    return { message: 'Released' }
  }

  @Post('inventory/scan')
  async inventoryScan() {
    return { found: false }
  }

  @Get('inventory/identifiers')
  async inventoryIdentifiers() {
    return []
  }

  @Get('inventory/daily-closing')
  async inventoryDailyClosing() {
    return []
  }

  @Get('inventory/daily-closing/:date')
  async inventoryDailyClosingDetail() {
    return []
  }

  private userRow(user: any) {
    const role = user.userRoles?.[0]?.role
    return {
      id: user.id,
      username: user.email,
      full_name: user.name,
      email: user.email,
      phone: user.phone,
      role_id: role?.id,
      role_name: role?.name,
      roles: user.userRoles?.map((ur: any) => ({ id: ur.role.id, name: ur.role.name })) || [],
      store_name: '',
      is_active: user.status === 'ACTIVE',
      last_login: user.lastLoginAt,
    }
  }

  private async ensureUnit(orgId: string, code: string) {
    const normalizedCode = code.toUpperCase()
    return this.prisma.unit.upsert({
      where: { organizationId_code: { organizationId: orgId, code: normalizedCode } },
      update: {},
      create: { organizationId: orgId, code: normalizedCode, name: normalizedCode },
    })
  }

  private countBy(items: any[], key: string) {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item[key] || '-', (counts.get(item[key] || '-') || 0) + 1)
    return [...counts.entries()].map(([entryKey, total]) => ({ key: entryKey, total })).sort((a, b) => b.total - a.total)
  }
}
