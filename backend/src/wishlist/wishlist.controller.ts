import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { AddToWishlistDto, ReorderWishlistDto, AddToWishlistForChildDto, UpdateWishlistItemDto } from './dto/wishlist.dto';

@Controller('wishlist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WishlistController {
  constructor(private wishlistService: WishlistService) {}

  @Get('child/wishlist')
  @Roles('CHILD')
  findAll(@User() user: RequestUser) {
    return this.wishlistService.findAll(user.userId);
  }

  @Get('parent/wishlist')
  @Roles('PARENT')
  findAllForParent(@User() user: RequestUser, @Query('childId') childId?: string) {
    if (childId) {
      // Возвращаем wishlist конкретного ребенка
      return this.wishlistService.findAll(childId);
    }
    // Возвращаем wishlist всех детей семьи
    return this.wishlistService.findAllForFamily(user.familyId);
  }

  @Post('parent/wishlist')
  @Roles('PARENT')
  addForChild(@User() user: RequestUser, @Body() dto: AddToWishlistForChildDto) {
    return this.wishlistService.add(dto.childId, { 
      rewardGoalId: dto.rewardGoalId,
      year: dto.year,
      status: dto.status,
    });
  }

  @Post('child/wishlist')
  @Roles('CHILD')
  add(@User() user: RequestUser, @Body() dto: AddToWishlistDto) {
    return this.wishlistService.add(user.userId, dto);
  }

  @Delete('child/wishlist/:id')
  @Roles('CHILD')
  remove(@User() user: RequestUser, @Param('id') id: string) {
    return this.wishlistService.remove(user.userId, id);
  }

  @Delete('parent/wishlist/:id')
  @Roles('PARENT')
  removeForParent(@User() user: RequestUser, @Param('id') id: string) {
    return this.wishlistService.removeForParent(id, user.familyId);
  }

  @Post('child/wishlist/reorder')
  @Roles('CHILD')
  reorder(@User() user: RequestUser, @Body() dto: ReorderWishlistDto) {
    return this.wishlistService.reorder(user.userId, dto);
  }

  @Patch('parent/wishlist/:id')
  @Roles('PARENT')
  update(@User() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateWishlistItemDto) {
    return this.wishlistService.update(id, user.familyId, dto);
  }

  @Patch('child/wishlist/:id')
  @Roles('CHILD')
  updateForChild(@User() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateWishlistItemDto) {
    return this.wishlistService.updateForChild(id, user.userId, dto);
  }
}
