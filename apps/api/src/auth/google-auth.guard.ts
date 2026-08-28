import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Encaminha ?state= (invite code) para o Google OAuth. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ query?: { state?: string } }>();
    const state = typeof req.query?.state === 'string' ? req.query.state : undefined;
    return state ? { state } : {};
  }
}
