import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY, PERMISSIONS_KEY } from '../decorators/roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles && !requiredPermissions) return true

    const { user } = context.switchToHttp().getRequest()
    if (!user) throw new ForbiddenException('No user context')

    // Role check (OR logic: any matching role grants access)
    if (requiredRoles?.length > 0) {
      const hasRole = requiredRoles.some(role => user.roleName === role)
      if (!hasRole) throw new ForbiddenException(`Requires one of roles: ${requiredRoles.join(', ')}`)
    }

    // Permission check (AND logic: all required permissions must be present)
    if (requiredPermissions?.length > 0) {
      const hasAllPermissions = requiredPermissions.every(p => user.permissions?.includes(p))
      if (!hasAllPermissions) {
        throw new ForbiddenException(`Missing required permissions: ${requiredPermissions.join(', ')}`)
      }
    }

    return true
  }
}
