import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { getPaginationArgs, paginate, PaginatedResult } from '../../../common/utils/pagination.util'

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, data: {
    categoryId: string; unitId: string; name: string; sku: string;
    barcode?: string; description?: string; hsnCode?: string; taxRate?: number;
    minStockLevel?: number; maxStockLevel?: number
  }) {
    const existing = await this.prisma.product.findFirst({
      where: { organizationId: orgId, sku: data.sku },
    })
    if (existing) throw new ConflictException('SKU already exists')
    return this.prisma.product.create({
      data: { organizationId: orgId, ...data },
      include: { category: true, unit: true },
    })
  }

  async findAll(orgId: string, params: {
    page?: number; limit?: number; search?: string; categoryId?: string
  }): Promise<PaginatedResult<any>> {
    const { skip, take, page, limit } = getPaginationArgs(params)
    const where: any = { organizationId: orgId, deletedAt: null, isActive: true }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { sku: { contains: params.search, mode: 'insensitive' } },
      ]
    }
    if (params.categoryId) where.categoryId = params.categoryId
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where, skip, take, orderBy: { name: 'asc' },
        include: { category: true, unit: true },
      }),
      this.prisma.product.count({ where }),
    ])
    return paginate(items, total, { page, limit })
  }

  async findById(orgId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { category: true, unit: true, stockBatches: { where: { deletedAt: null }, orderBy: { receivedDate: 'desc' }, take: 10 } },
    })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  async update(orgId: string, id: string, data: {
    name?: string; barcode?: string; description?: string;
    hsnCode?: string; taxRate?: number; minStockLevel?: number; maxStockLevel?: number; isActive?: boolean
  }) {
    const product = await this.prisma.product.findFirst({ where: { id, organizationId: orgId } })
    if (!product) throw new NotFoundException('Product not found')
    return this.prisma.product.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: { category: true, unit: true },
    })
  }

  async delete(orgId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, organizationId: orgId } })
    if (!product) throw new NotFoundException('Product not found')
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
  }
}
