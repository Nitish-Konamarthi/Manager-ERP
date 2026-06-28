import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { LoginDto, RefreshTokenDto, ChangePasswordDto, LoginResponseDto } from './dto/auth.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { ApiResponseDto } from '../../common/dto/api-response.dto'

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user and issue JWT tokens' })
  @ApiResponse({ status: 200, description: 'Login successful', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<ApiResponseDto<LoginResponseDto>> {
    const result = await this.authService.login(dto)
    return ApiResponseDto.ok(result, 'Login successful')
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<ApiResponseDto<{ accessToken: string }>> {
    const result = await this.authService.refresh(dto)
    return ApiResponseDto.ok(result, 'Token refreshed')
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<ApiResponseDto<null>> {
    await this.authService.changePassword(user.id, dto)
    return ApiResponseDto.ok(null, 'Password changed')
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponseDto<AuthenticatedUser>> {
    return ApiResponseDto.ok(user)
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a JWT token validity' })
  async verify(@Body('token') token: string): Promise<ApiResponseDto<any>> {
    const result = await this.authService.verify(token)
    return ApiResponseDto.ok(result)
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate current session' })
  async logout(@Body('refreshToken') refreshToken?: string): Promise<ApiResponseDto<null>> {
    await this.authService.logout(refreshToken)
    return ApiResponseDto.ok(null, 'Logged out')
  }
}
