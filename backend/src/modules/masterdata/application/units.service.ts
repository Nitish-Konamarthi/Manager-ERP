import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, data: { name: string; code: string }) {
    return this.prisma.unit.create({ data: { organizationId: orgId, ...data } })
  }

  async findAll(orgId: string) {
    return this.prisma.unit.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { name: 'asc' },
    })
  }

  async update(orgId: string, id: string, data: { name?: string; isActive?: boolean }) {
    const unit = await this.prisma.unit.findFirst({ where: { id, organizationId: orgId } })
    if (!unit) throw new NotFoundException('Unit not found')
    return this.prisma.unit.update({ where: { id }, data })
  }
}
