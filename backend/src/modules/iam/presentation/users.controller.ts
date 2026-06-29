import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { UsersService } from '../application/users.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new user' })
  async create(@CurrentUser('orgId') orgId: string, @Body() dto: {
    email: string; username?: string; password: string; name: string; phone?: string; roleIds: string[]
  }) {
    return this.usersService.create({ ...dto, organizationId: orgId })
  }

  @Get()
  @ApiOperation({ summary: 'List users' })
  async findAll(
    @CurrentUser('orgId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(orgId, { page, limit, search })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update user' })
  async update(@Param('id') id: string, @Body() dto: { name?: string; phone?: string; roleIds?: string[] }) {
    return this.usersService.update(id, dto)
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Deactivate user' })
  async deactivate(@Param('id') id: string) {
    await this.usersService.deactivate(id)
    return { message: 'User deactivated' }
  }
}
