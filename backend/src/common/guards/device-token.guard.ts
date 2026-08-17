import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { DeviceTokenService } from '../../auth/device-token.service';

/**
 * Пускает по долгоживущему токену устройства (scope=location).
 * Вешается ТОЛЬКО на приём геоточек — больше такой токен ничего не открывает.
 *
 * Кладёт в request.deviceContext, а не в request.user, чтобы случайное
 * переиспользование @User() на этих роутах не выглядело как обычная авторизация.
 */
@Injectable()
export class DeviceTokenGuard implements CanActivate {
  constructor(private deviceTokenService: DeviceTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Device token required');
    }

    request.deviceContext = await this.deviceTokenService.verify(header.slice(7).trim());
    return true;
  }
}
