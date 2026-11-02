import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { PairingService } from './pairing.service';
import { AcceptInviteDto, ClaimCodeDto, CreateCodeDto, FamilyPcDto, FamilyPcLoginDto, FamilyPcTokenDto, SecretDto } from './dto/pairing.dto';

@Controller('pairing')
export class PairingController {
  constructor(private pairing: PairingService) {}

  // --- родитель ---

  @Post('codes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  createCode(@User() user: RequestUser, @Body() dto: CreateCodeDto) {
    return this.pairing.createCode(user.familyId, dto.childId);
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  devices(@User() user: RequestUser) {
    return this.pairing.listDevices(user.familyId);
  }

  @Delete('devices/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  revoke(@User() user: RequestUser, @Param('id') id: string) {
    return this.pairing.revokeDevice(user.familyId, id);
  }

  @Delete('children/:childId/secret')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  resetSecret(@User() user: RequestUser, @Param('childId') childId: string) {
    return this.pairing.resetSecret(user.familyId, childId);
  }

  @Post('family-pc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  enableFamilyPc(@User() user: RequestUser, @Body() dto: FamilyPcDto) {
    return this.pairing.enableFamilyPc(user.familyId, user.userId, dto?.name);
  }

  @Post('invites')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  createInvite(@User() user: RequestUser) {
    return this.pairing.createInvite(user.familyId, user.userId);
  }

  // --- ребёнок ---

  @Put('secret')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CHILD')
  setSecret(@User() user: RequestUser, @Body() dto: SecretDto) {
    return this.pairing.setSecret(user.userId, dto.pictures);
  }

  // --- без входа (защищены кодом, токеном компьютера или приглашения) ---

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  claim(@Body() dto: ClaimCodeDto) {
    return this.pairing.claimCode(dto.code, dto.deviceId, dto.platform, dto.deviceName);
  }

  @Post('family-pc/kids')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  familyPcKids(@Body() dto: FamilyPcTokenDto) {
    return this.pairing.familyPcKids(dto.token);
  }

  @Post('family-pc/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  familyPcLogin(@Body() dto: FamilyPcLoginDto) {
    return this.pairing.familyPcLogin(dto.token, dto.childId, dto.pictures);
  }

  @Get('invites/:token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  describeInvite(@Param('token') token: string) {
    return this.pairing.describeInvite(token);
  }

  @Post('invites/:token/accept')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  acceptInvite(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.pairing.acceptInvite(token, dto);
  }
}
