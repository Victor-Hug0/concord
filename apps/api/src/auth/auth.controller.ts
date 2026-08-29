import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthUser } from './auth.types';

class SendVerificationDto {
  @IsEmail()
  email!: string;
}

class RegisterDto {
  @IsString()
  @MinLength(4)
  inviteCode!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(6)
  verificationToken!: string;
}

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('verification/send')
  sendVerification(@Body() body: SendVerificationDto) {
    return this.auth.sendVerificationEmail(body.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.auth.register(
      body.inviteCode,
      body.email,
      body.password,
      body.displayName,
      body.verificationToken,
    );
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  async logout(@Body() body: RefreshDto) {
    return this.auth.logout(body.refreshToken);
  }

  @Get('me')
  me(@Req() req: Request & { user: AuthUser }) {
    return req.user;
  }
}
