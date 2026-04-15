import { Controller, Post, Body, HttpCode, HttpStatus, Patch, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, ChildPinLoginDto, UpdateProfileDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User, RequestUser } from '../common/decorators/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    try {
      console.log('[AuthController] Register attempt:', { email: dto.email, login: dto.login, role: dto.role });
      const result = await this.authService.register(dto);
      console.log('[AuthController] Register successful');
      return result;
    } catch (error: any) {
      console.error('[AuthController] Register error:', error.message);
      console.error('[AuthController] Error stack:', error.stack);
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    try {
      console.log('[AuthController] Login attempt:', JSON.stringify(dto));
      const result = await this.authService.login(dto);
      console.log('[AuthController] Login successful');
      return result;
    } catch (error: any) {
      console.error('[AuthController] Login error:', error.message);
      console.error('[AuthController] Error stack:', error.stack);
      throw error;
    }
  }

  @Post('child-pin-login')
  @HttpCode(HttpStatus.OK)
  async childPinLogin(@Body() dto: ChildPinLoginDto) {
    return this.authService.childPinLogin(dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateProfile(@User() user: RequestUser, @Body() dto: UpdateProfileDto) {
    try {
      console.log('[AuthController] updateProfile called:', { userId: user.userId, dto });
      const result = await this.authService.updateProfile(user.userId, dto);
      console.log('[AuthController] updateProfile successful');
      return result;
    } catch (error: any) {
      console.error('[AuthController] updateProfile error:', error.message);
      console.error('[AuthController] Error stack:', error.stack);
      throw error;
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@User() user: RequestUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@User() user: RequestUser) {
    return this.authService.getProfile(user.userId);
  }
}
