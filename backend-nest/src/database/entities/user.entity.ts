import { Entity, Column, Index, OneToMany } from 'typeorm'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { BaseEntity } from './base.entity'
import { Exclude } from 'class-transformer'

@Entity('users')
export class User extends BaseEntity {
  @ApiProperty()
  @Index({ unique: true })
  @Column({ type: 'text', unique: true })
  username: string

  @Exclude()
  @Column({ type: 'text', name: 'password_hash' })
  passwordHash: string

  @ApiProperty()
  @Column({ type: 'text', name: 'full_name' })
  fullName: string

  @ApiPropertyOptional()
  @Column({ type: 'text', nullable: true })
  email?: string

  @ApiPropertyOptional()
  @Column({ type: 'text', nullable: true })
  phone?: string

  @ApiPropertyOptional()
  @Column({ type: 'text', name: 'role_id', nullable: true })
  roleId?: string

  @ApiPropertyOptional()
  @Column({ type: 'text', name: 'store_id', nullable: true })
  storeId?: string

  @ApiProperty()
  @Column({ type: 'integer', name: 'is_active', default: 1 })
  isActive: number

  @ApiPropertyOptional()
  @Column({ type: 'text', name: 'last_login', nullable: true })
  lastLogin?: string

  @Column({ type: 'text', nullable: true })
  refreshToken?: string
}

@Entity('roles')
export class Role extends BaseEntity {
  @ApiProperty()
  @Index({ unique: true })
  @Column({ type: 'text', unique: true })
  name: string

  @ApiPropertyOptional()
  @Column({ type: 'text', nullable: true })
  description?: string

  @OneToMany(() => Permission, p => p.roleId)
  permissions: Permission[]
}

@Entity('permissions')
@Index(['roleId', 'module'], { unique: true })
export class Permission extends BaseEntity {
  @Column({ type: 'text', name: 'role_id' })
  roleId: string

  @Column({ type: 'text' })
  module: string

  @Column({ type: 'integer', name: 'can_read', default: 0 })
  canRead: number

  @Column({ type: 'integer', name: 'can_create', default: 0 })
  canCreate: number

  @Column({ type: 'integer', name: 'can_update', default: 0 })
  canUpdate: number

  @Column({ type: 'integer', name: 'can_delete', default: 0 })
  canDelete: number

  @Column({ type: 'integer', name: 'can_approve', default: 0 })
  canApprove: number

  @Column({ type: 'text', nullable: true })
  scope?: string // store-specific, global, etc.
}
