import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.role.findMany({
      where: { deletedAt: null },
      include: { permissions: true },
      orderBy: { name: 'asc' },
    })
  }

  async findById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true },
    })
    if (!role || role.deletedAt) throw new NotFoundException('Role not found')
    return role
  }

  async create(data: { name: string; description?: string; permissions?: { resource: string; action: string }[] }) {
    return this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions ? { create: data.permissions } : undefined,
      },
      include: { permissions: true },
    })
  }

  async update(id: string, data: { name?: string; description?: string; permissions?: { resource: string; action: string }[] }) {
    const role = await this.prisma.role.findUnique({ where: { id } })
    if (!role) throw new NotFoundException('Role not found')
    return this.prisma.$transaction(async tx => {
      if (data.permissions) {
        await tx.permission.deleteMany({ where: { roleId: id } })
        await tx.permission.createMany({
          data: data.permissions.map(p => ({ roleId: id, ...p })),
        })
      }
      return tx.role.update({
        where: { id },
        data: { name: data.name, description: data.description },
        include: { permissions: true },
      })
    })
  }

  async delete(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } })
    if (!role) throw new NotFoundException('Role not found')
    if (role.isSystem) throw new Error('Cannot delete system role')
    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
