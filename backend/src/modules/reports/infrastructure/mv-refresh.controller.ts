import { Controller, Post, Param } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { UseGuards } from '@nestjs/common'
import { MvRefreshProcessor } from './mv-refresh.processor'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { Roles } from '../../../common/decorators/roles.decorator'

@Controller('admin/refresh-views')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MvRefreshController {
  constructor(private processor: MvRefreshProcessor) {}

  @Post('all')
  async refreshAll() {
    await this.processor.refreshAll()
    return { message: 'All materialized views refreshed' }
  }

  @Post(':view')
  async refreshOne(@Param('view') view: string) {
    await this.processor.refreshOne(view)
    return { message: `Materialized view '${view}' refreshed` }
  }
}
