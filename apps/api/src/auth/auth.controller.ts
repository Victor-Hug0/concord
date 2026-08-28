import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthUser } from './auth.types';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from './google-auth.guard';

class DevLoginDto {
  @IsString()
  @MinLength(4)
  inviteCode!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

class StartOAuthDto {
  @IsString()
  @MinLength(4)
  inviteCode!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  @Public()
  @Post('google/start')
  startGoogle(@Body() body: StartOAuthDto) {
    const base = this.config.get('API_URL', 'http://localhost:3000');
    const url = `${base}/auth/google?state=${encodeURIComponent(body.inviteCode)}`;
    return { url };
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    return;
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request & { user: Parameters<AuthService['loginWithGoogle']>[0] },
    @Res() res: Response,
  ) {
    const tokens = await this.auth.loginWithGoogle(req.user);
    const redirectBase = this.config.get('OAUTH_SUCCESS_REDIRECT', 'concord://auth/callback');
    const url = new URL(redirectBase);
    url.searchParams.set('accessToken', tokens.accessToken);
    url.searchParams.set('refreshToken', tokens.refreshToken);
    return res.redirect(url.toString());
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('dev-login')
  async devLogin(@Body() body: DevLoginDto) {
    return this.auth.devLogin(body.inviteCode, body.email, body.displayName);
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
