import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthService } from '../application/auth.service'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { Public } from '../../../common/decorators/public.decorator'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email/username and password' })
  async login(@Body() dto: { identifier: string; password: string }) {
    return this.authService.login(dto.identifier, dto.password)
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refresh(dto.refreshToken)
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify JWT token and return user details' })
  async verify(@Body() dto: { token: string }) {
    return this.authService.verify(dto.token)
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@CurrentUser('id') userId: string) {
    await this.authService.logout(userId)
    return { message: 'Logged out successfully' }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: { oldPassword: string; newPassword: string },
  ) {
    await this.authService.changePassword(userId, dto.oldPassword, dto.newPassword)
    return { message: 'Password changed successfully' }
  }
}
