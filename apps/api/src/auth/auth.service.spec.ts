import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, SCREEN_QUALITY_TABLE } from '@concord/shared';

describe('shared contracts', () => {
  it('caps attachments at 500MB', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(500 * 1024 * 1024);
  });

  it('defines screen presets 144p-1080p', () => {
    expect(Object.keys(SCREEN_QUALITY_TABLE)).toEqual([
      '144p',
      '240p',
      '360p',
      '480p',
      '720p',
      '1080p',
    ]);
  });
});
