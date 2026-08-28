import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MAX_ATTACHMENT_BYTES } from '@concord/shared';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { createReadStream, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class FilesService {
  private s3: S3Client | null = null;
  private bucket: string;
  private localRoot: string;
  private driver: 's3' | 'local';

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private messages: MessagesService,
    private realtime: RealtimeService,
  ) {
    this.bucket = config.get('S3_BUCKET', 'concord-attachments');
    this.driver = config.get('STORAGE_DRIVER', 'local') === 's3' ? 's3' : 'local';
    this.localRoot = config.get(
      'LOCAL_STORAGE_PATH',
      path.resolve(process.cwd(), '../../.data/uploads'),
    );
    mkdirSync(this.localRoot, { recursive: true });
    if (this.driver === 's3') {
      this.s3 = new S3Client({
        region: config.get('S3_REGION', 'us-east-1'),
        endpoint: config.get('S3_ENDPOINT', 'http://localhost:9000'),
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.get('S3_ACCESS_KEY', 'concord'),
          secretAccessKey: config.get('S3_SECRET_KEY', 'concordsecret'),
        },
      });
    }
  }

  async attachToMessage(
    messageId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo obrigatório');
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException('Arquivo excede 500 MB');
    }
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message || message.deletedAt) throw new NotFoundException('Mensagem não encontrada');
    if (message.authorId !== userId) {
      throw new BadRequestException('Só o autor pode anexar arquivos');
    }

    const objectKey = `attachments/${message.channelId}/${randomUUID()}-${file.originalname}`;
    if (this.driver === 'local') {
      const full = path.join(this.localRoot, objectKey);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, file.buffer);
    } else {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          ContentLength: file.size,
        }),
      );
    }

    await this.prisma.attachment.create({
      data: {
        messageId,
        objectKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        authorId: userId,
      },
    });

    const full = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: { author: true, attachments: true, reactions: true },
    });
    const payload = this.messages.serialize(full, userId);
    this.realtime.broadcast('message:updated', payload);
    return payload;
  }

  async getDownloadUrl(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado');

    if (this.driver === 'local') {
      const api = this.config.get('API_URL', 'http://localhost:3000');
      const exp = Math.floor(Date.now() / 1000) + 300;
      const token = this.signContentToken(attachmentId, exp);
      return {
        url: `${api}/files/${attachmentId}/content?exp=${exp}&token=${token}`,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      };
    }

    let url = await getSignedUrl(
      this.s3!,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: attachment.objectKey,
      }),
      { expiresIn: 300 },
    );
    const publicBase = this.config.get<string>('S3_PUBLIC_URL');
    if (publicBase) {
      try {
        const signed = new URL(url);
        const pub = new URL(publicBase);
        signed.protocol = pub.protocol;
        signed.host = pub.host;
        url = signed.toString();
      } catch {
        /* keep signed URL as-is */
      }
    }
    return {
      url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  openLocalStream(attachmentId: string, exp: string, token: string) {
    const expNum = Number(exp);
    if (!expNum || expNum < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Link expirado');
    }
    const expected = this.signContentToken(attachmentId, expNum);
    const a = Buffer.from(expected);
    const b = Buffer.from(token || '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Token inválido');
    }
    return this.prisma.attachment.findUnique({ where: { id: attachmentId } }).then((attachment) => {
      if (!attachment) throw new NotFoundException('Anexo não encontrado');
      const full = path.join(this.localRoot, attachment.objectKey);
      if (!existsSync(full)) throw new NotFoundException('Arquivo ausente');
      return {
        stream: createReadStream(full),
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      };
    });
  }

  private signContentToken(attachmentId: string, exp: number) {
    const secret = this.config.getOrThrow('JWT_ACCESS_SECRET');
    return createHmac('sha256', secret).update(`${attachmentId}:${exp}`).digest('hex');
  }

  async remove(attachmentId: string, userId: string, role: 'admin' | 'member') {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado');
    if (attachment.authorId !== userId && role !== 'admin') {
      throw new BadRequestException('Sem permissão');
    }
    if (this.driver === 'local') {
      const full = path.join(this.localRoot, attachment.objectKey);
      if (existsSync(full)) unlinkSync(full);
    } else {
      await this.s3!.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: attachment.objectKey }),
      );
    }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    return { ok: true };
  }
}
