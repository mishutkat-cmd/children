import { Body, Controller, Delete, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { PushService } from './push.service';
import { RegisterPushTokenDto, RemovePushTokenDto } from './push.dto';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private push: PushService) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  register(@User() user: RequestUser, @Body() dto: RegisterPushTokenDto) {
    return this.push.register(user.userId, user.familyId, dto.token, dto.platform);
  }

  @Delete('token')
  @HttpCode(HttpStatus.OK)
  remove(@User() user: RequestUser, @Body() dto: RemovePushTokenDto) {
    return this.push.remove(user.userId, dto.token);
  }
}
