import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // getAllAndOverride, а не get(handler): раньше читались метаданные ТОЛЬКО
    // обработчика, поэтому @Roles('PARENT') на классе молча ничего не значил —
    // ребёнок проходил в родительские эндпоинты children/notifications/upload.
    // Порядок [handler, class] сохраняет привычную семантику: декоратор на
    // методе перекрывает классовый (как @Roles('CHILD') на child/summary).
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return !!user && requiredRoles.includes(user.role);
  }
}
