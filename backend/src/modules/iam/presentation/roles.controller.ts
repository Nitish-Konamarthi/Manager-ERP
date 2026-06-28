import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { RolesService } from '../application/roles.service'
import { Roles } from '../../../common/decorators/roles.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'List all roles' })
  async findAll() {
    return this.rolesService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID' })
  async findById(@Param('id') id: string) {
    return this.rolesService.findById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new role' })
  async create(@Body() dto: { name: string; description?: string; permissions?: { resource: string; action: string }[] }) {
    return this.rolesService.create(dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update role' })
  async update(@Param('id') id: string, @Body() dto: { name?: string; description?: string; permissions?: { resource: string; action: string }[] }) {
    return this.rolesService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete role' })
  async delete(@Param('id') id: string) {
    await this.rolesService.delete(id)
    return { message: 'Role deleted' }
  }
}
