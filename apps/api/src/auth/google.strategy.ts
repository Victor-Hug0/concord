import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'unset',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'unset',
      callbackURL: config.get<string>(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:3000/auth/google/callback',
      ),
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  validate(
    req: { query?: { state?: string }; session?: { inviteCode?: string } },
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const inviteCode =
      (typeof req.query?.state === 'string' && req.query.state) ||
      req.session?.inviteCode ||
      '';
    done(null, {
      googleSub: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      displayName: profile.displayName || profile.emails?.[0]?.value || 'Usuário',
      avatarUrl: profile.photos?.[0]?.value,
      inviteCode,
    });
  }
}
