import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { User, Role, Permission } from '../../database/entities/user.entity'
import { LoginDto, LoginResponseDto, RefreshTokenDto, ChangePasswordDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private refreshTokens = new Map<string, { userId: string; expiresAt: number }>()

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.userRepo.findOne({
      where: { username: dto.username },
      select: ['id', 'username', 'passwordHash', 'fullName', 'email', 'roleId', 'storeId', 'isActive'],
    })

    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials')
    if (!user.passwordHash) throw new UnauthorizedException('Account not configured')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    // Get role and permissions
    let roleName = ''
    let permissions: string[] = []
    if (user.roleId) {
      const role = await this.roleRepo.findOne({ where: { id: user.roleId } })
      if (role) {
        roleName = role.name
        const perms = await this.permissionRepo.find({ where: { roleId: user.roleId } })
        permissions = perms
          .filter(p => p.canRead)
          .map(p => `${p.module}:${p.canCreate ? 'write' : 'read'}`)
      }
    }

    // Generate tokens
    const payload = {
      sub: user.id,
      username: user.username,
      roleId: user.roleId,
      roleName,
      storeId: user.storeId,
      permissions,
    }

    const accessToken = this.jwtService.sign(payload)
    const refreshToken = uuid()
    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })

    // Update last login
    await this.userRepo.update(user.id, { lastLogin: new Date().toISOString() })

    this.logger.log(`Login: ${user.username} (${user.id})`)

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        roleId: user.roleId,
        roleName,
        storeId: user.storeId,
        permissions,
      },
    }
  }

  async refresh(dto: RefreshTokenDto): Promise<{ accessToken: string }> {
    const record = this.refreshTokens.get(dto.refreshToken)
    if (!record || record.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }

    const user = await this.userRepo.findOne({ where: { id: record.userId } })
    if (!user) throw new UnauthorizedException('User not found')

    const payload = { sub: user.id, username: user.username }
    const accessToken = this.jwtService.sign(payload)

    return { accessToken }
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'passwordHash'] })
    if (!user) throw new UnauthorizedException('User not found')

    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Current password is incorrect')

    const hash = await bcrypt.hash(dto.newPassword, 12)
    await this.userRepo.update(userId, { passwordHash: hash })
    this.logger.log(`Password changed: ${userId}`)
  }

  async verify(token: string): Promise<{ valid: boolean; user?: any }> {
    try {
      const decoded = this.jwtService.verify(token)
      const user = await this.userRepo.findOne({ where: { id: decoded.sub } })
      if (!user) return { valid: false }
      return {
        valid: true,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          roleId: user.roleId,
          storeId: user.storeId,
        },
      }
    } catch {
      return { valid: false }
    }
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) this.refreshTokens.delete(refreshToken)
  }
}
