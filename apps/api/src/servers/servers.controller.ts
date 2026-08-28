import { Controller, Get } from '@nestjs/common';
import { ServersService } from './servers.service';

@Controller('server')
export class ServersController {
  constructor(private servers: ServersService) {}

  @Get()
  get() {
    return this.servers.getSingleton();
  }
}
