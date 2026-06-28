import { Module } from '@nestjs/common'
import { OrganizationController } from './presentation/organization.controller'

@Module({
  controllers: [OrganizationController],
})
export class OrganizationModule {}
