import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return {
      ok: true,
      service: 'concord-api',
      sha: process.env.DEPLOY_SHA || process.env.GIT_SHA || null,
      ts: new Date().toISOString(),
    };
  }
}
