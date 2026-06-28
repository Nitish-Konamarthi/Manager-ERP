import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { getPaginationArgs, paginate, PaginatedResult } from '../../../common/utils/pagination.util'

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, data: {
    name: string; companyName?: string; email?: string; phone?: string;
    gstin?: string; address?: string
  }) {
    return this.prisma.supplier.create({ data: { organizationId: orgId, ...data } })
  }

  async findAll(orgId: string, params: { page?: number; limit?: number; search?: string }): Promise<PaginatedResult<any>> {
    const { skip, take, page, limit } = getPaginationArgs(params)
    const where: any = { organizationId: orgId, deletedAt: null }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ]
    }
    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ])
    return paginate(items, total, { page, limit })
  }

  async findById(orgId: string, id: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, organizationId: orgId, deletedAt: null } })
    if (!s) throw new NotFoundException('Supplier not found')
    return s
  }

  async update(orgId: string, id: string, data: any) {
    const s = await this.prisma.supplier.findFirst({ where: { id, organizationId: orgId } })
    if (!s) throw new NotFoundException('Supplier not found')
    return this.prisma.supplier.update({ where: { id }, data: { ...data, version: { increment: 1 } } })
  }

  async delete(orgId: string, id: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, organizationId: orgId } })
    if (!s) throw new NotFoundException('Supplier not found')
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } })
  }
}
