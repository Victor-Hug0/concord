import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  displayName!: string;
}

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@Req() req: Request & { user: AuthUser }) {
    return this.users.getById(req.user.id);
  }

  @Patch('me')
  update(@Req() req: Request & { user: AuthUser }, @Body() body: UpdateProfileDto) {
    return this.users.updateProfile(req.user.id, body.displayName);
  }

  @Get()
  list() {
    return this.users.list();
  }
}
