import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { PiggybankService } from './piggybank.service';
import { AllocateDto, CashDto, ConvertDto, GoalDoneDto } from './piggybank.dto';

/**
 * Копилка ребёнка в гривнах. Ребёнок работает со своей, родитель — с любой
 * копилкой своей семьи (childId в запросе).
 */
@Controller('piggybank')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHILD', 'PARENT')
export class PiggybankController {
  constructor(private piggybank: PiggybankService) {}

  @Get()
  summary(@User() user: RequestUser, @Query('childId') childId?: string) {
    return this.piggybank.summary(user, childId);
  }

  @Post('cash')
  @HttpCode(HttpStatus.OK)
  cash(@User() user: RequestUser, @Body() dto: CashDto) {
    return this.piggybank.cash(user, dto.amountCents, dto.note, dto.childId);
  }

  @Post('convert')
  @HttpCode(HttpStatus.OK)
  convert(@User() user: RequestUser, @Body() dto: ConvertDto) {
    return this.piggybank.convert(user, dto.points, dto.childId, dto.keepInWallet);
  }

  @Post('allocate')
  @HttpCode(HttpStatus.OK)
  allocate(@User() user: RequestUser, @Body() dto: AllocateDto) {
    return this.piggybank.allocate(user, dto.rewardId, dto.amountCents, dto.childId);
  }

  @Post('goals/:rewardId/done')
  @HttpCode(HttpStatus.OK)
  done(@User() user: RequestUser, @Param('rewardId') rewardId: string, @Body() dto: GoalDoneDto) {
    return this.piggybank.goalDone(user, rewardId, dto.childId);
  }
}
