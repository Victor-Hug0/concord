import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { Roles } from '../auth/public.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser } from '../auth/auth.types';
import { ChannelsService } from './channels.service';

class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsEnum(['text', 'voice'] as const)
  type!: 'text' | 'voice';
}

class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsInt()
  position?: number;
}

@Controller('channels')
@UseGuards(RolesGuard)
export class ChannelsController {
  constructor(private channels: ChannelsService) {}

  @Get()
  list() {
    return this.channels.list();
  }

  @Roles('admin')
  @Post()
  create(@Req() req: Request & { user: AuthUser }, @Body() body: CreateChannelDto) {
    return this.channels.create(body.name, body.type, req.user.id);
  }

  @Roles('admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateChannelDto) {
    return this.channels.update(id, body);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.channels.remove(id);
  }
}
