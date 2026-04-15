import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { CreateRewardDto, UpdateRewardDto } from './dto/rewards.dto';

@Controller('rewards')
@UseGuards(JwtAuthGuard)
export class RewardsController {
  constructor(private rewardsService: RewardsService) {}

  @Get()
  findAll(@User() user: RequestUser, @Query('status') status?: string) {
    return this.rewardsService.findAll(user.familyId, status as any);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('PARENT', 'CHILD')
  create(@User() user: RequestUser, @Body() dto: CreateRewardDto) {
    return this.rewardsService.create(user.familyId, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('PARENT', 'CHILD')
  update(
    @User() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateRewardDto,
  ) {
    return this.rewardsService.update(id, user.familyId, dto);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  archive(@User() user: RequestUser, @Param('id') id: string) {
    return this.rewardsService.archive(id, user.familyId);
  }

  @Post(':id/unarchive')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  unarchive(@User() user: RequestUser, @Param('id') id: string) {
    return this.rewardsService.unarchive(id, user.familyId);
  }
}
