import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, MinLength, IsOptional } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @MinLength(3)
  username: string

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(4)
  password: string
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  oldPassword: string

  @ApiProperty()
  @IsString()
  @MinLength(6)
  newPassword: string
}

export class LoginResponseDto {
  @ApiProperty() accessToken: string
  @ApiProperty() refreshToken: string
  @ApiProperty() expiresIn: number
  @ApiProperty() tokenType: string = 'Bearer'

  @ApiProperty()
  user: {
    id: string
    username: string
    fullName: string
    email?: string
    roleId?: string
    roleName?: string
    storeId?: string
    permissions: string[]
  }
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email: string
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string

  @ApiProperty()
  @IsString()
  @MinLength(6)
  newPassword: string
}
