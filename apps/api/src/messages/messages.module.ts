import { Module, forwardRef } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';

@Module({
  imports: [ChannelsModule, forwardRef(() => RealtimeModule)],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
