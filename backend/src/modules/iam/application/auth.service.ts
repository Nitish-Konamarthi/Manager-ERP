import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../../prisma/prisma.service'
import { JwtPayload, LoginResponse, TokenPair } from '../../../common/interfaces/auth.interface'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(identifier: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
      include: { userRoles: { include: { role: { include: { permissions: true } } } } },
    })
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials')
    }
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials')
    }
    const roles = user.userRoles.map(ur => ur.role.name)
    const permissions = [...new Set(user.userRoles.flatMap(ur => ur.role.permissions.map(p => `${p.resource}:${p.action}`)))]
    const tokens = await this.generateTokens(user.id, user.email, user.organizationId, roles, permissions)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), refreshToken: tokens.refreshToken },
    })
    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, roles },
    }
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify(refreshToken) as JwtPayload
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { userRoles: { include: { role: { include: { permissions: true } } } } },
      })
      if (!user || user.refreshToken !== refreshToken || user.status !== 'ACTIVE') {
        throw new UnauthorizedException()
      }
      const roles = user.userRoles.map(ur => ur.role.name)
      const permissions = [...new Set(user.userRoles.flatMap(ur => ur.role.permissions.map(p => `${p.resource}:${p.action}`)))]
      const tokens = await this.generateTokens(user.id, user.email, user.organizationId, roles, permissions)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
      })
      return tokens
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }
  }

  async verify(token: string) {
    try {
      const payload = this.jwtService.verify(token) as JwtPayload
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { userRoles: { include: { role: { include: { permissions: true } } } } },
      })
      if (!user || user.status !== 'ACTIVE') {
        return { valid: false }
      }
      const roles = user.userRoles.map(ur => ur.role.name)
      return {
        valid: true,
        user: { id: user.id, email: user.email, name: user.name, roles },
      }
    } catch {
      return { valid: false }
    }
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    })
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('User not found')
    const valid = await bcrypt.compare(oldPassword, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Current password is incorrect')
    const hash = await bcrypt.hash(newPassword, 12)
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, refreshToken: null, version: { increment: 1 } },
    })
  }

  private generateTokens(userId: string, email: string, orgId: string, roles: string[], permissions: string[]): TokenPair {
    const payload: JwtPayload = { sub: userId, email, orgId, roles, permissions }
    const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES || '15m'
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES || '7d'
    return {
      accessToken: this.jwtService.sign(payload as any, { expiresIn: accessExpiresIn } as any),
      refreshToken: this.jwtService.sign(payload as any, { expiresIn: refreshExpiresIn } as any),
    }
  }
}
