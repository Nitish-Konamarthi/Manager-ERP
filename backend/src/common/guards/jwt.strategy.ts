import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../interfaces/auth.interface'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change-me',
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: {
          include: {
            role: { include: { permissions: true } },
          },
        },
      },
    })
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive')
    }

    const roles = user.userRoles.map(ur => ur.role.name)
    const permissions = [
      ...new Set(user.userRoles.flatMap(ur => ur.role.permissions.map(p => `${p.resource}:${p.action}`))),
    ]

    return {
      id: user.id,
      email: user.email,
      orgId: user.organizationId,
      roles,
      permissions,
    }
  }
}
