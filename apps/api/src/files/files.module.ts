import { Module, forwardRef } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

@Module({
  imports: [forwardRef(() => MessagesModule), forwardRef(() => RealtimeModule)],
  providers: [FilesService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
