import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PrismaService } from '../prisma/prisma.service'
import { Public } from '../common/decorators/public.decorator'

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ok', database: 'connected', timestamp: new Date().toISOString() }
    } catch {
      return { status: 'degraded', database: 'disconnected', timestamp: new Date().toISOString() }
    }
  }
}
