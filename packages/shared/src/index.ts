import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'member']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const ChannelTypeSchema = z.enum(['text', 'voice']);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(64),
  role: UserRoleSchema,
  avatarUrl: z.string().url().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const ChannelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  type: ChannelTypeSchema,
  position: z.number().int(),
  createdAt: z.string().datetime(),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  authorId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const ReactionSchema = z.object({
  emoji: z.string().min(1).max(32),
  count: z.number().int().nonnegative(),
  me: z.boolean(),
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  authorId: z.string().uuid(),
  authorDisplayName: z.string(),
  body: z.string().max(4000),
  parentId: z.string().uuid().nullable(),
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  attachments: z.array(AttachmentSchema).default([]),
  reactions: z.array(ReactionSchema).default([]),
  mentionUserIds: z.array(z.string().uuid()).default([]),
});
export type Message = z.infer<typeof MessageSchema>;

export const MAX_ATTACHMENT_BYTES = 500 * 1024 * 1024;

export const ScreenQualityPresetSchema = z.enum([
  '144p',
  '240p',
  '360p',
  '480p',
  '720p',
  '1080p',
]);
export type ScreenQualityPreset = z.infer<typeof ScreenQualityPresetSchema>;

/** Proposed defaults for phase 7 — visual quality priority */
export const SCREEN_QUALITY_TABLE: Record<
  ScreenQualityPreset,
  { width: number; height: number; fps: number; maxBitrateKbps: number }
> = {
  '144p': { width: 256, height: 144, fps: 15, maxBitrateKbps: 300 },
  '240p': { width: 426, height: 240, fps: 20, maxBitrateKbps: 500 },
  '360p': { width: 640, height: 360, fps: 24, maxBitrateKbps: 800 },
  '480p': { width: 854, height: 480, fps: 24, maxBitrateKbps: 1200 },
  '720p': { width: 1280, height: 720, fps: 30, maxBitrateKbps: 2500 },
  '1080p': { width: 1920, height: 1080, fps: 30, maxBitrateKbps: 4500 },
};

export const WsEventSchema = z.enum([
  'message:new',
  'message:updated',
  'message:deleted',
  'reaction:updated',
  'presence:update',
  'voice:joined',
  'voice:left',
  'voice:mute',
  'webrtc:signal',
  'screenshare:started',
  'screenshare:stopped',
  'channel:updated',
]);
export type WsEvent = z.infer<typeof WsEventSchema>;

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};
