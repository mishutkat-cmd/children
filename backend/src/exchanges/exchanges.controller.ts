import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ExchangesService } from './exchanges.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { CreateExchangeDto, CreateExchangeForChildDto } from './dto/exchanges.dto';

@Controller('exchanges')
@UseGuards(JwtAuthGuard)
export class ExchangesController {
  constructor(private exchangesService: ExchangesService) {}

  @Post('child/exchanges')
  @UseGuards(RolesGuard)
  @Roles('CHILD')
  create(@User() user: RequestUser, @Body() dto: CreateExchangeDto) {
    return this.exchangesService.create(user.userId, user.familyId, dto);
  }

  @Get('child/exchanges')
  @UseGuards(RolesGuard)
  @Roles('CHILD')
  findAll(@User() user: RequestUser) {
    return this.exchangesService.findAll(user.userId, user.familyId);
  }

  @Get('parent/exchanges/pending')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  findPending(@User() user: RequestUser) {
    return this.exchangesService.findPending(user.familyId);
  }

  @Get('parent/exchanges/history')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  findHistory(@User() user: RequestUser) {
    return this.exchangesService.findHistory(user.familyId);
  }

  @Post('parent/exchanges')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  createForChild(@User() user: RequestUser, @Body() dto: CreateExchangeForChildDto) {
    try {
      console.log('[ExchangesController] createForChild called:', { childId: dto.childId, cashCents: dto.cashCents, rewardGoalId: dto.rewardGoalId, familyId: user.familyId });
      return this.exchangesService.create(dto.childId, user.familyId, dto);
    } catch (error: any) {
      console.error('[ExchangesController] Error in createForChild:', error.message);
      throw error;
    }
  }

  @Post('parent/exchanges/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  approve(@User() user: RequestUser, @Param('id') id: string) {
    return this.exchangesService.approve(id, user.familyId);
  }

  @Post('parent/exchanges/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  reject(@User() user: RequestUser, @Param('id') id: string) {
    return this.exchangesService.reject(id, user.familyId);
  }

  @Post('parent/exchanges/:id/delivered')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  markDelivered(@User() user: RequestUser, @Param('id') id: string) {
    return this.exchangesService.markDelivered(id, user.familyId);
  }
}
