import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { loadCostMap } from './report-helpers'

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ── 1. Daily Sales ──

  async dailySales(orgId: string, date: string) {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    const orders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: start, lt: end },
      },
      include: { items: { include: { product: true } }, customer: true },
    })

    let totalQty = 0
    let totalRevenue = 0
    let totalCost = 0
    const itemDetails: Record<string, { qty: number; revenue: number; cost: number; margin: number }> = {}

    const productIds = [...new Set(orders.flatMap(o => o.items.map(i => i.productId)))]
    const costMap = productIds.length > 0 ? await loadCostMap(this.prisma, orgId, productIds) : new Map()

    for (const o of orders) {
      totalRevenue += Number(o.total)
      for (const item of o.items) {
        const qty = Number(item.quantity)
        const price = Number(item.unitPrice)
        totalQty += qty

        const name = item.product.name
        if (!itemDetails[name]) {
          const cost = costMap.get(item.productId) ?? 0
          itemDetails[name] = { qty: 0, revenue: 0, cost, margin: 0 }
        }
        itemDetails[name].qty += qty
        itemDetails[name].revenue += qty * price
        totalCost += qty * itemDetails[name].cost
      }
    }

    for (const d of Object.values(itemDetails)) {
      d.margin = d.revenue > 0 ? ((d.revenue - d.qty * d.cost) / d.revenue) * 100 : 0
    }

    const topItems = Object.entries(itemDetails)
      .map(([product, data]) => ({ product, ...data }))
      .sort((a, b) => b.revenue - a.revenue)

    return {
      date,
      orderCount: orders.length,
      totalRevenue,
      totalCost,
      grossMargin: totalRevenue - totalCost,
      marginPercent: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
      totalQuantity: totalQty,
      topItems: topItems.slice(0, 20),
    }
  }

  // ── 2. Purchase Reports ──

  async purchaseReport(orgId: string, fromDate: string, toDate: string) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      include: { items: { include: { product: true } }, supplier: true },
    })

    let totalPurchase = 0
    const bySupplier: Record<string, number> = {}
    const byProduct: Record<string, { qty: number; amount: number }> = {}

    for (const o of orders) {
      totalPurchase += Number(o.total)
      const sName = o.supplier.name
      bySupplier[sName] = (bySupplier[sName] || 0) + Number(o.total)

      for (const item of o.items) {
        const pName = item.product.name
        if (!byProduct[pName]) byProduct[pName] = { qty: 0, amount: 0 }
        byProduct[pName].qty += Number(item.quantity)
        byProduct[pName].amount += Number(item.totalPrice)
      }
    }

    const topSuppliers = Object.entries(bySupplier)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)

    const topProducts = Object.entries(byProduct)
      .map(([name, data]) => ({ product: name, ...data }))
      .sort((a, b) => b.amount - a.amount)

    return {
      period: { from: fromDate, to: toDate },
      totalOrders: orders.length,
      totalPurchase,
      topSuppliers,
      topProducts: topProducts.slice(0, 20),
    }
  }

  // ── 3. Stock Reports ──

  async stockReport(orgId: string) {
    const batches = await this.prisma.stockBatch.findMany({
      where: { organizationId: orgId, deletedAt: null, availableQty: { gt: 0 } },
      include: { product: { include: { category: true } }, shop: true },
      orderBy: { product: { name: 'asc' } },
    })

    const byCategory: Record<string, { qty: number; value: number; products: number }> = {}
    const byShop: Record<string, { qty: number; value: number }> = {}

    for (const b of batches) {
      const avail = Number(b.availableQty) - Number(b.reservedQty)
      if (avail <= 0) continue
      const value = Number(b.unitCost) * avail

      const cat = b.product.category?.name || 'Uncategorized'
      if (!byCategory[cat]) byCategory[cat] = { qty: 0, value: 0, products: 0 }
      byCategory[cat].qty += avail
      byCategory[cat].value += value
      byCategory[cat].products++

      const shop = b.shop?.name || 'Main'
      if (!byShop[shop]) byShop[shop] = { qty: 0, value: 0 }
      byShop[shop].qty += avail
      byShop[shop].value += value
    }

    return {
      totalProducts: batches.length,
      totalQuantity: Object.values(byCategory).reduce((s, c) => s + c.qty, 0),
      totalValue: Object.values(byCategory).reduce((s, c) => s + c.value, 0),
      byCategory,
      byShop,
    }
  }

  async fastMovingProducts(orgId: string, days = 30) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        organizationId: orgId,
        movementType: 'SOLD',
        createdAt: { gte: cutoff },
      },
      include: { product: true },
    })

    const productSales: Record<string, { qty: number; revenue: number; days: number }> = {}
    for (const m of movements) {
      const id = m.productId
      if (!productSales[id]) {
        productSales[id] = { qty: 0, revenue: 0, days }
      }
      productSales[id].qty += Math.abs(Number(m.quantity))
      productSales[id].revenue += Math.abs(Number(m.totalCost))
    }

    // Get current stock for turnover calculation
    const batches = await this.prisma.stockBatch.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { product: { include: { category: true } } },
    })

    const currentStock: Record<string, number> = {}
    for (const b of batches) {
      const id = b.productId
      currentStock[id] = (currentStock[id] || 0) + Number(b.availableQty) - Number(b.reservedQty)
    }

    const result = Object.entries(productSales).map(([productId, data]) => {
      const batch = batches.find(b => b.productId === productId)
      const stock = currentStock[productId] || 0
      const dailyRate = data.qty / data.days
      const turnoverDays = dailyRate > 0 ? stock / dailyRate : 999
      return {
        product: batch?.product.name || 'Unknown',
        category: batch?.product.category?.name,
        soldQty: data.qty,
        avgDailySales: dailyRate.toFixed(2),
        currentStock: stock,
        turnoverDays: turnoverDays === 999 ? 'No sales' : turnoverDays.toFixed(1),
      }
    })

    const sorted = [...result].sort((a, b) => Number(b.avgDailySales) - Number(a.avgDailySales))
    return {
      fastMoving: sorted.filter(r => typeof r.turnoverDays !== 'string' && Number(r.turnoverDays) <= 7).slice(0, 20),
      slowMoving: sorted.filter(r => typeof r.turnoverDays === 'string' || Number(r.turnoverDays) > 30),
    }
  }

  // ── 4. Spoilage / Waste Report ──

  async spoilageReport(orgId: string, fromDate: string, toDate: string) {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        organizationId: orgId,
        movementType: { in: ['WRITTEN_OFF', 'ADJUSTED'] },
        createdAt: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      include: { product: true, batch: true },
      orderBy: { createdAt: 'desc' },
    })

    const adjustments = await this.prisma.inventoryAdjustment.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
    })

    let totalLost = 0
    let totalValueLost = 0
    const byReason: Record<string, { qty: number; value: number }> = {}
    const byProduct: Record<string, { qty: number; value: number }> = {}
    const aging: Record<string, { qty: number; value: number }> = {
      '0-3 days': { qty: 0, value: 0 },
      '4-7 days': { qty: 0, value: 0 },
      '8-14 days': { qty: 0, value: 0 },
      '15+ days': { qty: 0, value: 0 },
    }

    const adjProductIds = [...new Set(adjustments.map(a => a.productId))]
    const adjCostMap = await loadCostMap(this.prisma, orgId, adjProductIds)

    for (const adj of adjustments) {
      const qty = Math.abs(Number(adj.quantity))
      const unitCost = adjCostMap.get(adj.productId) ?? 0
      const value = qty * unitCost
      totalLost += qty
      totalValueLost += value

      const reason = adj.adjustmentType
      if (!byReason[reason]) byReason[reason] = { qty: 0, value: 0 }
      byReason[reason].qty += qty
      byReason[reason].value += value

      const product = movements.find(m => m.productId === adj.productId)?.product?.name || adj.productId
      if (!byProduct[product]) byProduct[product] = { qty: 0, value: 0 }
      byProduct[product].qty += qty
      byProduct[product].value += value

      const batch = await this.prisma.stockBatch.findUnique({ where: { id: adj.batchId } })
      if (batch) {
        const age = Math.floor((adj.createdAt.getTime() - new Date(batch.receivedDate).getTime()) / (86400000))
        if (age <= 3) { aging['0-3 days'].qty += qty; aging['0-3 days'].value += value }
        else if (age <= 7) { aging['4-7 days'].qty += qty; aging['4-7 days'].value += value }
        else if (age <= 14) { aging['8-14 days'].qty += qty; aging['8-14 days'].value += value }
        else { aging['15+ days'].qty += qty; aging['15+ days'].value += value }
      }
    }

    const spoilageRate = totalLost > 0
      ? ((totalValueLost / (totalValueLost + await this.getTotalSalesValue(orgId, fromDate, toDate))) * 100).toFixed(2)
      : '0.00'

    return {
      period: { from: fromDate, to: toDate },
      totalLost,
      totalValueLost,
      spoilageRate: `${spoilageRate}%`,
      byReason,
      byProduct: Object.entries(byProduct).map(([n, d]) => ({ product: n, ...d })).sort((a, b) => b.qty - a.qty),
      byAge: aging,
    }
  }

  // ── 5. Profit Report ──

  async profitReport(orgId: string, fromDate: string, toDate: string) {
    const sales = await this.prisma.salesOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      include: { items: { include: { product: true } } },
    })

    let revenue = 0
    let cogs = 0
    const byProduct: Record<string, { qty: number; revenue: number; cost: number; margin: number }> = {}

    const productIds = [...new Set(sales.flatMap(o => o.items.map(i => i.productId)))]
    const costMap = await loadCostMap(this.prisma, orgId, productIds)

    for (const o of sales) {
      revenue += Number(o.total)
      for (const item of o.items) {
        const qty = Number(item.quantity)
        const itemRevenue = qty * Number(item.unitPrice)
        const unitCost = costMap.get(item.productId) ?? 0
        const itemCost = qty * unitCost
        cogs += itemCost

        const pName = item.product.name
        if (!byProduct[pName]) byProduct[pName] = { qty: 0, revenue: 0, cost: 0, margin: 0 }
        byProduct[pName].qty += qty
        byProduct[pName].revenue += itemRevenue
        byProduct[pName].cost += itemCost
        byProduct[pName].margin = byProduct[pName].revenue > 0
          ? ((byProduct[pName].revenue - byProduct[pName].cost) / byProduct[pName].revenue) * 100
          : 0
      }
    }

    const expenses = await this.prisma.expenseClaim.findMany({
      where: {
        organizationId: orgId,
        claimDate: { gte: new Date(fromDate), lte: new Date(toDate) },
        status: 'APPROVED',
      },
    })
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)

    const grossProfit = revenue - cogs
    const netProfit = grossProfit - totalExpenses

    return {
      period: { from: fromDate, to: toDate },
      summary: {
        revenue,
        cogs,
        grossProfit,
        grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        totalExpenses,
        netProfit,
        netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      },
      byProduct: Object.entries(byProduct)
        .map(([p, d]) => ({ product: p, ...d }))
        .sort((a, b) => b.margin - a.margin),
    }
  }

  // ── 6. Outstanding Customers ──

  async outstandingCustomers(orgId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: {
        salesOrders: {
          where: { paymentStatus: { in: ['PENDING', 'PARTIAL'] }, deletedAt: null },
          orderBy: { orderDate: 'desc' },
        },
      },
    })

    return customers
      .filter(c => c.salesOrders.length > 0)
      .map(c => {
        const outstanding = c.salesOrders.reduce((s, o) => s + (Number(o.total) - Number(o.paidAmount)), 0)
        const oldest = c.salesOrders[c.salesOrders.length - 1]
        const daysSinceLastOrder = oldest
          ? Math.floor((Date.now() - new Date(oldest.orderDate).getTime()) / 86400000)
          : 0
        return {
          id: c.id,
          name: c.name,
          companyName: c.companyName,
          phone: c.phone,
          outstanding,
          creditLimit: Number(c.creditLimit || 0),
          daysSinceLastOrder,
          overdueDays: outstanding > (Number(c.creditLimit) || 0) ? daysSinceLastOrder : 0,
          orderCount: c.salesOrders.length,
        }
      })
      .sort((a, b) => b.outstanding - a.outstanding)
  }

  // ── 7. Supplier Ledger ──

  async supplierLedger(orgId: string, supplierId: string, fromDate: string, toDate: string) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId: orgId,
        supplierId,
        deletedAt: null,
        orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      orderBy: { orderDate: 'asc' },
    })

    let balance = 0
    const entries = orders.map(o => {
      balance += Number(o.total)
      return {
        date: o.orderDate,
        type: 'PURCHASE',
        reference: o.orderNumber,
        amount: Number(o.total),
        balance,
        status: o.status,
      }
    })

    const totalPurchased = orders.reduce((s, o) => s + Number(o.total), 0)
    const outstanding = orders
      .filter(o => o.status !== 'CANCELLED' && o.status !== 'RETURNED')
      .reduce((s, o) => s + Number(o.total), 0)

    return { supplierId, entries, summary: { totalPurchased, outstanding, entryCount: entries.length } }
  }

  // ── 8. Customer Ledger ──

  async customerLedger(orgId: string, customerId: string, fromDate: string, toDate: string) {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId: orgId,
        customerId,
        deletedAt: null,
        orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      orderBy: { orderDate: 'asc' },
    })

    const ledgerEntries = await this.prisma.customerLedger.findMany({
      where: {
        organizationId: orgId,
        customerId,
        transactionDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      orderBy: { transactionDate: 'asc' },
    })

    let balance = 0
    const entries = [
      ...orders.map(o => {
        balance += Number(o.total)
        return {
          date: o.orderDate,
          type: 'SALE',
          reference: o.orderNumber,
          amount: Number(o.total),
          balance,
          status: o.paymentStatus,
        }
      }),
      ...ledgerEntries.map(l => {
        balance += l.type === 'PAYMENT' ? -Number(l.amount) : Number(l.amount)
        return {
          date: l.transactionDate,
          type: l.type,
          reference: l.referenceType || '',
          amount: l.type === 'PAYMENT' ? -Number(l.amount) : Number(l.amount),
          balance,
        }
      }),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return {
      customerId,
      entries,
      currentBalance: balance,
    }
  }

  // ── 9. Cash Book ──

  async cashBook(orgId: string, fromDate: string, toDate: string) {
    const cashAccount = await this.prisma.account.findFirst({
      where: { organizationId: orgId, accountCode: '1001', deletedAt: null },
    })
    if (!cashAccount) return { error: 'Cash account not found' }

    const transactions = await this.prisma.accountTransaction.findMany({
      where: {
        organizationId: orgId,
        accountId: cashAccount.id,
        transactionDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      orderBy: { transactionDate: 'asc' },
    })

    let runningBalance = Number(cashAccount.openingBalance)
    const entries = transactions.map(t => {
      const amount = Number(t.amount)
      runningBalance += t.type === 'DEBIT' ? amount : -amount
      return {
        date: t.transactionDate,
        type: t.type,
        description: t.description || '',
        amount: t.type === 'DEBIT' ? amount : -amount,
        balance: runningBalance,
        reference: t.referenceType ? `${t.referenceType}:${t.referenceId}` : '',
      }
    })

    return {
      openingBalance: Number(cashAccount.openingBalance),
      closingBalance: runningBalance,
      totalDebits: entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0),
      totalCredits: entries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0),
      entries,
    }
  }

  // ── 10. Bank Book ──

  async bankBook(orgId: string, fromDate: string, toDate: string) {
    const bankAccount = await this.prisma.account.findFirst({
      where: { organizationId: orgId, accountCode: '1002', deletedAt: null },
    })
    if (!bankAccount) return { error: 'Bank account not found' }

    const transactions = await this.prisma.accountTransaction.findMany({
      where: {
        organizationId: orgId,
        accountId: bankAccount.id,
        transactionDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      orderBy: { transactionDate: 'asc' },
    })

    let runningBalance = Number(bankAccount.openingBalance)
    const entries = transactions.map(t => {
      const amount = Number(t.amount)
      runningBalance += t.type === 'DEBIT' ? amount : -amount
      return {
        date: t.transactionDate,
        type: t.type,
        description: t.description || '',
        amount: t.type === 'DEBIT' ? amount : -amount,
        balance: runningBalance,
        reference: t.referenceType ? `${t.referenceType}:${t.referenceId}` : '',
      }
    })

    return {
      openingBalance: Number(bankAccount.openingBalance),
      closingBalance: runningBalance,
      entries,
    }
  }

  // ── 11. Expense Reports ──

  async expenseReport(orgId: string, fromDate: string, toDate: string) {
    const claims = await this.prisma.expenseClaim.findMany({
      where: {
        organizationId: orgId,
        claimDate: { gte: new Date(fromDate), lte: new Date(toDate) },
        status: 'APPROVED',
      },
      include: { head: true },
      orderBy: { claimDate: 'desc' },
    })

    const byHead: Record<string, { count: number; total: number }> = {}
    let grandTotal = 0

    for (const c of claims) {
      const headName = c.head?.name || 'Other'
      if (!byHead[headName]) byHead[headName] = { count: 0, total: 0 }
      byHead[headName].count++
      byHead[headName].total += Number(c.amount)
      grandTotal += Number(c.amount)
    }

    return {
      period: { from: fromDate, to: toDate },
      totalClaims: claims.length,
      grandTotal,
      byHead: Object.entries(byHead).map(([head, data]) => ({ head, ...data })),
      recentClaims: claims.slice(0, 20).map(c => ({
        date: c.claimDate,
        head: c.head?.name,
        amount: c.amount,
        description: c.description,
      })),
    }
  }

  // ── 12. Top Customers ──

  async topCustomers(orgId: string, fromDate: string, toDate: string, limit = 10) {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      include: { customer: true, items: true },
    })

    const byCustomer: Record<string, { name: string; orders: number; revenue: number; qty: number }> = {}
    for (const o of orders) {
      const id = o.customerId
      if (!byCustomer[id]) {
        byCustomer[id] = { name: o.customer.name, orders: 0, revenue: 0, qty: 0 }
      }
      byCustomer[id].orders++
      byCustomer[id].revenue += Number(o.total)
      byCustomer[id].qty += o.items.reduce((s, i) => s + Number(i.quantity), 0)
    }

    return Object.entries(byCustomer)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
  }

  // ── 13. Top Suppliers ──

  async topSuppliers(orgId: string, fromDate: string, toDate: string, limit = 10) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      include: { supplier: true },
    })

    const bySupplier: Record<string, { name: string; orders: number; amount: number }> = {}
    for (const o of orders) {
      const id = o.supplierId
      if (!bySupplier[id]) bySupplier[id] = { name: o.supplier.name, orders: 0, amount: 0 }
      bySupplier[id].orders++
      bySupplier[id].amount += Number(o.total)
    }

    return Object.entries(bySupplier)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit)
  }

  // ── 14. Product Profitability ──

  async productProfitability(orgId: string, fromDate: string, toDate: string) {
    const orders = await this.prisma.salesOrderItem.findMany({
      where: {
        order: {
          organizationId: orgId,
          deletedAt: null,
          orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
        },
      },
      include: { product: true },
    })

    const productIds = [...new Set(orders.map(i => i.productId))]
    const costMap = await loadCostMap(this.prisma, orgId, productIds)

    const byProduct: Record<string, {
      product: string; category: string; qty: number; revenue: number; cost: number; margin: number; marginPct: number
    }> = {}

    for (const item of orders) {
      const id = item.productId
      if (!byProduct[id]) {
        const product = item.product
        byProduct[id] = {
          product: product.name,
          category: '',
          qty: 0, revenue: 0, cost: 0, margin: 0, marginPct: 0,
        }
      }
      const qty = Number(item.quantity)
      const rev = qty * Number(item.unitPrice)
      const unitCost = costMap.get(id) ?? 0
      const cost = qty * unitCost

      byProduct[id].qty += qty
      byProduct[id].revenue += rev
      byProduct[id].cost += cost
      byProduct[id].margin = byProduct[id].revenue - byProduct[id].cost
      byProduct[id].marginPct = byProduct[id].revenue > 0
        ? (byProduct[id].margin / byProduct[id].revenue) * 100
        : 0
    }

    return Object.values(byProduct)
      .sort((a, b) => b.margin - a.margin)
      .map((p, i) => ({ rank: i + 1, ...p }))
  }

  // ── 15. Monthly Trends ──

  async monthlyTrends(orgId: string, months = 12) {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)

    const salesOrders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: startDate, lte: endDate },
      },
    })

    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: startDate, lte: endDate },
      },
    })

    const monthly: Record<string, {
      month: string; sales: number; purchases: number; orderCount: number; poCount: number
    }> = {}

    for (const o of salesOrders) {
      const key = `${o.orderDate.getFullYear()}-${String(o.orderDate.getMonth() + 1).padStart(2, '0')}`
      if (!monthly[key]) monthly[key] = { month: key, sales: 0, purchases: 0, orderCount: 0, poCount: 0 }
      monthly[key].sales += Number(o.total)
      monthly[key].orderCount++
    }

    for (const o of purchaseOrders) {
      const key = `${o.orderDate.getFullYear()}-${String(o.orderDate.getMonth() + 1).padStart(2, '0')}`
      if (!monthly[key]) monthly[key] = { month: key, sales: 0, purchases: 0, orderCount: 0, poCount: 0 }
      monthly[key].purchases += Number(o.total)
      monthly[key].poCount++
    }

    return Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month))
  }

  // ── 16. Yearly Trends ──

  async yearlyTrends(orgId: string, years = 5) {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - years)

    const salesOrders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: startDate, lte: endDate },
      },
    })

    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: startDate, lte: endDate },
      },
    })

    const yearly: Record<string, {
      year: string; sales: number; purchases: number; orderCount: number; poCount: number
    }> = {}

    for (const o of salesOrders) {
      const key = `${o.orderDate.getFullYear()}`
      if (!yearly[key]) yearly[key] = { year: key, sales: 0, purchases: 0, orderCount: 0, poCount: 0 }
      yearly[key].sales += Number(o.total)
      yearly[key].orderCount++
    }

    for (const o of purchaseOrders) {
      const key = `${o.orderDate.getFullYear()}`
      if (!yearly[key]) yearly[key] = { year: key, sales: 0, purchases: 0, orderCount: 0, poCount: 0 }
      yearly[key].purchases += Number(o.total)
      yearly[key].poCount++
    }

    return Object.values(yearly).sort((a, b) => a.year.localeCompare(b.year))
  }



  private async getTotalSalesValue(orgId: string, fromDate: string, toDate: string): Promise<number> {
    const result = await this.prisma.salesOrder.aggregate({
      where: {
        organizationId: orgId,
        deletedAt: null,
        orderDate: { gte: new Date(fromDate), lte: new Date(toDate) },
      },
      _sum: { total: true },
    })
    return Number(result._sum.total || 0)
  }
}
