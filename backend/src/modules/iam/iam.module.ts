import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from '../../common/guards/jwt.strategy'
import { AuthService } from './application/auth.service'
import { UsersService } from './application/users.service'
import { RolesService } from './application/roles.service'
import { AuthController } from './presentation/auth.controller'
import { UsersController } from './presentation/users.controller'
import { RolesController } from './presentation/roles.controller'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me',
      signOptions: { expiresIn: (process.env.JWT_ACCESS_EXPIRES || '15m') as any },
    }),
  ],
  controllers: [AuthController, UsersController, RolesController],
  providers: [AuthService, UsersService, RolesService, JwtStrategy],
  exports: [AuthService, UsersService],
})
export class IamModule {}
