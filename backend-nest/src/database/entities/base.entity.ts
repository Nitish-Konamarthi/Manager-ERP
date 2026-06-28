import { CreateDateColumn, UpdateDateColumn, DeleteDateColumn, VersionColumn, Column, PrimaryGeneratedColumn } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'

export abstract class BaseEntity {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ApiProperty()
  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt: Date

  @ApiProperty()
  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt: Date

  @ApiProperty()
  @DeleteDateColumn({ type: 'datetime', name: 'deleted_at', nullable: true })
  deletedAt?: Date

  @ApiProperty()
  @VersionColumn({ type: 'integer', default: 1, name: 'version' })
  version: number

  @Column({ type: 'text', name: 'created_by', nullable: true })
  createdBy?: string

  @Column({ type: 'text', name: 'updated_by', nullable: true })
  updatedBy?: string
}
