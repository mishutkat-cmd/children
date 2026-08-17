import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { DeviceContext } from '../../auth/device-token.service';

export const Device = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): DeviceContext => {
    return ctx.switchToHttp().getRequest().deviceContext;
  },
);

export type { DeviceContext };
