import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_ATTACHMENT_BYTES } from '@concord/shared';
import { Request, Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { Public } from '../auth/public.decorator';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private files: FilesService) {}

  @Post('messages/:messageId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  upload(
    @Param('messageId') messageId: string,
    @Req() req: Request & { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.files.attachToMessage(messageId, req.user.id, file);
  }

  @Get(':attachmentId/download')
  download(@Param('attachmentId') attachmentId: string) {
    return this.files.getDownloadUrl(attachmentId);
  }

  @Public()
  @Get(':attachmentId/content')
  async content(
    @Param('attachmentId') attachmentId: string,
    @Query('exp') exp: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const { stream, mimeType, fileName } = await this.files.openLocalStream(
      attachmentId,
      exp,
      token,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    stream.pipe(res);
  }

  @Delete(':attachmentId')
  remove(
    @Param('attachmentId') attachmentId: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.files.remove(attachmentId, req.user.id, req.user.role);
  }
}
