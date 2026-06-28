import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../../prisma/prisma.service'
import { getPaginationArgs, paginate, PaginatedResult } from '../../../common/utils/pagination.util'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    organizationId: string
    email: string
    password: string
    name: string
    phone?: string
    roleIds: string[]
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } })
    if (existing) throw new ConflictException('Email already in use')
    const hash = await bcrypt.hash(data.password, 12)
    const user = await this.prisma.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        passwordHash: hash,
        name: data.name,
        phone: data.phone,
        userRoles: {
          create: data.roleIds.map(roleId => ({ roleId })),
        },
      },
      include: { userRoles: { include: { role: true } } },
    })
    return this.toResponse(user)
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
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { userRoles: { include: { role: true } } },
      }),
      this.prisma.user.count({ where }),
    ])
    return paginate(items.map(u => this.toResponse(u)), total, { page, limit })
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    })
    if (!user || user.deletedAt) throw new NotFoundException('User not found')
    return this.toResponse(user)
  }

  async update(id: string, data: { name?: string; phone?: string; roleIds?: string[] }) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user || user.deletedAt) throw new NotFoundException('User not found')
    const updated = await this.prisma.$transaction(async tx => {
      if (data.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } })
        await tx.userRole.createMany({
          data: data.roleIds.map(roleId => ({ userId: id, roleId })),
        })
      }
      return tx.user.update({
        where: { id },
        data: {
          name: data.name,
          phone: data.phone,
          version: { increment: 1 },
        },
        include: { userRoles: { include: { role: true } } },
      })
    })
    return this.toResponse(updated)
  }

  async deactivate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new NotFoundException('User not found')
    await this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE', refreshToken: null, version: { increment: 1 } },
    })
  }

  private toResponse(user: any) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      status: user.status,
      roles: user.userRoles?.map((ur: any) => ({ id: ur.role.id, name: ur.role.name })) || [],
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }
  }
}
