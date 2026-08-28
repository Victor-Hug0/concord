import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, service: 'concord-api', ts: new Date().toISOString() };
  }
}
