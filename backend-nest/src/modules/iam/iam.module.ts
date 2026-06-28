import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User, Role, Permission } from '../../database/entities/user.entity'

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Permission])],
  controllers: [],
  providers: [],
})
export class IamModule {}
