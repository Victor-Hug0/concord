import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Request } from 'express';
import { Roles } from '../auth/public.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser } from '../auth/auth.types';
import { InvitesService } from './invites.service';

class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  ttlDays?: number;
}

@Controller('invites')
@UseGuards(RolesGuard)
@Roles('admin')
export class InvitesController {
  constructor(private invites: InvitesService) {}

  @Get()
  list() {
    return this.invites.list();
  }

  @Post()
  create(@Req() req: Request & { user: AuthUser }, @Body() body: CreateInviteDto) {
    return this.invites.create(req.user.id, body.maxUses ?? 1, body.ttlDays);
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.invites.revoke(id);
  }
}
