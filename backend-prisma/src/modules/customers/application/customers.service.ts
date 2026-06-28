import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { getPaginationArgs, paginate, PaginatedResult } from '../../../common/utils/pagination.util'

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, data: {
    name: string; companyName?: string; email?: string; phone?: string;
    gstin?: string; address?: string; creditLimit?: number
  }) {
    return this.prisma.customer.create({
      data: { organizationId: orgId, ...data },
    })
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
      this.prisma.customer.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.customer.count({ where }),
    ])
    return paginate(items, total, { page, limit })
  }

  async findById(orgId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    })
    if (!customer) throw new NotFoundException('Customer not found')
    return customer
  }

  async update(orgId: string, id: string, data: {
    name?: string; companyName?: string; email?: string; phone?: string;
    gstin?: string; address?: string; creditLimit?: number
  }) {
    const c = await this.prisma.customer.findFirst({ where: { id, organizationId: orgId } })
    if (!c) throw new NotFoundException('Customer not found')
    return this.prisma.customer.update({ where: { id }, data: { ...data, version: { increment: 1 } } })
  }

  async delete(orgId: string, id: string) {
    const c = await this.prisma.customer.findFirst({ where: { id, organizationId: orgId } })
    if (!c) throw new NotFoundException('Customer not found')
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } })
  }
}
