import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../../database/entities/user.entity'

interface JwtPayload {
  sub: string
  username: string
  roleId: string
  roleName: string
  storeId?: string
  permissions: string[]
  iat: number
  exp: number
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub, isActive: 1 },
      select: ['id', 'username', 'fullName', 'roleId', 'storeId'],
    })
    if (!user) throw new UnauthorizedException('User not found or inactive')

    return {
      id: payload.sub,
      username: payload.username,
      fullName: user.fullName,
      roleId: payload.roleId,
      roleName: payload.roleName,
      storeId: payload.storeId || user.storeId,
      permissions: payload.permissions || [],
      sessionId: `${payload.sub}-${payload.iat}`,
    }
  }
}
