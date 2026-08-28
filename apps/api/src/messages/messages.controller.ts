import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { MessagesService } from './messages.service';

class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentionUserIds?: string[];
}

class UpdateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

class ReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  emoji!: string;
}

@Controller('channels/:channelId/messages')
export class MessagesController {
  constructor(private messages: MessagesService) {}

  @Get()
  list(
    @Param('channelId') channelId: string,
    @Req() req: Request & { user: AuthUser },
    @Query('before') before?: string,
    @Query('limit') limit?: string,
    @Query('parentId') parentId?: string,
    @Query('q') q?: string,
  ) {
    return this.messages.list(
      channelId,
      {
        before,
        limit: limit ? Number(limit) : undefined,
        parentId: parentId === 'null' ? null : parentId,
        q,
      },
      req.user.id,
    );
  }

  @Post()
  create(
    @Param('channelId') channelId: string,
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateMessageDto,
  ) {
    return this.messages.create(
      channelId,
      req.user.id,
      body.body,
      body.parentId,
      body.mentionUserIds ?? [],
    );
  }

  @Patch(':messageId')
  update(
    @Param('messageId') messageId: string,
    @Req() req: Request & { user: AuthUser },
    @Body() body: UpdateMessageDto,
  ) {
    return this.messages.update(messageId, req.user.id, body.body);
  }

  @Delete(':messageId')
  remove(
    @Param('messageId') messageId: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.messages.softDelete(messageId, req.user.id, req.user.role);
  }

  @Post(':messageId/reactions')
  react(
    @Param('messageId') messageId: string,
    @Req() req: Request & { user: AuthUser },
    @Body() body: ReactionDto,
  ) {
    return this.messages.toggleReaction(messageId, req.user.id, body.emoji);
  }
}
