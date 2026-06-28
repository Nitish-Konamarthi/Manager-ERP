import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, data: { name: string; code?: string; parentId?: string; description?: string }) {
    return this.prisma.category.create({
      data: { organizationId: orgId, ...data },
      include: { parent: true },
    })
  }

  async findAll(orgId: string) {
    return this.prisma.category.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { parent: true, children: true },
      orderBy: { name: 'asc' },
    })
  }

  async findById(orgId: string, id: string) {
    const cat = await this.prisma.category.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { parent: true, children: true, products: { where: { deletedAt: null } } },
    })
    if (!cat) throw new NotFoundException('Category not found')
    return cat
  }

  async update(orgId: string, id: string, data: { name?: string; description?: string; parentId?: string }) {
    const cat = await this.prisma.category.findFirst({ where: { id, organizationId: orgId } })
    if (!cat) throw new NotFoundException('Category not found')
    return this.prisma.category.update({ where: { id }, data })
  }

  async delete(orgId: string, id: string) {
    const cat = await this.prisma.category.findFirst({ where: { id, organizationId: orgId } })
    if (!cat) throw new NotFoundException('Category not found')
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } })
  }
}
