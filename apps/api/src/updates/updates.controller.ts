import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { UpdatesService } from './updates.service';

@Controller('updates')
export class UpdatesController {
  constructor(private updates: UpdatesService) {}

  @Public()
  @Get()
  async index() {
    const files = await this.updates.listFilenames();
    return { ok: true, files };
  }

  @Public()
  @Get(':filename')
  async download(@Param('filename') filename: string, @Res() res: Response) {
    const { stream, size, contentType } = await this.updates.openAssetStream(filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=60');
    stream.pipe(res);
  }
}
