import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { PrismaService } from '../../../prisma/prisma.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private prisma: PrismaService) {}

  @Get('shops')
  @ApiOperation({ summary: 'List shops' })
  async findShops(@CurrentUser('orgId') orgId: string) {
    return this.prisma.shop.findMany({ where: { organizationId: orgId, deletedAt: null } })
  }

  @Post('shops')
  @ApiOperation({ summary: 'Create shop' })
  async createShop(@CurrentUser('orgId') orgId: string, @Body() dto: { name: string; code: string; address?: string; phone?: string; email?: string }) {
    return this.prisma.shop.create({ data: { organizationId: orgId, ...dto } })
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'List warehouses' })
  async findWarehouses(@CurrentUser('orgId') orgId: string) {
    return this.prisma.warehouse.findMany({ where: { organizationId: orgId, deletedAt: null } })
  }

  @Post('warehouses')
  @ApiOperation({ summary: 'Create warehouse' })
  async createWarehouse(@CurrentUser('orgId') orgId: string, @Body() dto: { name: string; code: string; address?: string }) {
    return this.prisma.warehouse.create({ data: { organizationId: orgId, ...dto } })
  }

  @Get('branches')
  @ApiOperation({ summary: 'List branches' })
  async findBranches(@CurrentUser('orgId') orgId: string) {
    return this.prisma.branch.findMany({ where: { organizationId: orgId, deletedAt: null } })
  }

  @Post('branches')
  @ApiOperation({ summary: 'Create branch' })
  async createBranch(@CurrentUser('orgId') orgId: string, @Body() dto: { name: string; code: string; address?: string }) {
    return this.prisma.branch.create({ data: { organizationId: orgId, ...dto } })
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get organization profile' })
  async getProfile(@CurrentUser('orgId') orgId: string) {
    return this.prisma.organization.findUnique({ where: { id: orgId } })
  }
}
