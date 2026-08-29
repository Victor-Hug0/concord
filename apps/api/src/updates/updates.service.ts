import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

type GhAsset = {
  name: string;
  url: string;
  size: number;
};

type GhRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: GhAsset[];
};

@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);
  private cache: { at: number; release: GhRelease | null } = { at: 0, release: null };

  constructor(private config: ConfigService) {}

  private get token(): string | undefined {
    return (
      this.config.get<string>('GITHUB_RELEASES_TOKEN') ||
      this.config.get<string>('GH_TOKEN') ||
      this.config.get<string>('GITHUB_TOKEN')
    );
  }

  private get repo(): string {
    return this.config.get<string>('GITHUB_REPO', 'Victor-Hug0/concord');
  }

  private async fetchLatestRelease(): Promise<GhRelease> {
    const now = Date.now();
    if (this.cache.release && now - this.cache.at < 60_000) {
      return this.cache.release;
    }

    const token = this.token;
    if (!token) {
      throw new ServiceUnavailableException('Feed de updates não configurado (GITHUB_RELEASES_TOKEN)');
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'concord-api-updates',
      Authorization: `Bearer ${token}`,
    };

    const res = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
      headers,
    });

    if (res.status === 404) {
      throw new NotFoundException('Nenhuma release publicada no GitHub');
    }
    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(`GitHub releases/latest ${res.status}: ${body.slice(0, 200)}`);
      throw new ServiceUnavailableException('Falha ao consultar releases no GitHub');
    }

    const release = (await res.json()) as GhRelease;
    this.cache = { at: now, release };
    return release;
  }

  private assertSafeFilename(name: string) {
    if (!/^[\w.\-+ ()]+$/.test(name) || name.includes('..')) {
      throw new BadRequestException('Nome de arquivo inválido');
    }
  }

  async listFilenames(): Promise<string[]> {
    const release = await this.fetchLatestRelease();
    return release.assets.map((a) => a.name);
  }

  async openAssetStream(filename: string): Promise<{
    stream: Readable;
    size: number;
    contentType: string;
  }> {
    this.assertSafeFilename(filename);
    const release = await this.fetchLatestRelease();
    const asset = release.assets.find((a) => a.name === filename);
    if (!asset) {
      throw new NotFoundException(`Artefato não encontrado na release ${release.tag_name}`);
    }

    const token = this.token!;
    const res = await fetch(asset.url, {
      headers: {
        Accept: 'application/octet-stream',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'concord-api-updates',
      },
    });

    if (!res.ok || !res.body) {
      throw new ServiceUnavailableException('Falha ao baixar artefato da release');
    }

    const contentType =
      filename.endsWith('.yml') || filename.endsWith('.yaml')
        ? 'text/yaml; charset=utf-8'
        : 'application/octet-stream';

    const stream = Readable.fromWeb(res.body as import('stream/web').ReadableStream);

    return { stream, size: asset.size, contentType };
  }
}
