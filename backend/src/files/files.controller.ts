import { Controller, Get, NotFoundException, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User, RequestUser } from '../common/decorators/user.decorator';
import { DocStore } from '../db/doc-store.service';
import { LocalStorageService } from './local-storage.service';

/**
 * Authenticated read access to private uploads.
 *
 * Only proof photos live here. In Firebase they were fetched through
 * short-lived signed URLs, so they were never publicly readable; the static
 * handler must not serve them, and this route reproduces the access control
 * the signed URLs provided — plus an ownership check they did not have, since
 * a leaked signed URL worked for anyone holding it.
 */
@Controller('api/v1/files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(
    private readonly storage: LocalStorageService,
    private readonly db: DocStore,
  ) {}

  @Get('*')
  async serve(@Req() req: Request, @Res() res: Response, @User() user: RequestUser) {
    // Everything after the route prefix is the object path.
    const objectPath = decodeURIComponent(String(req.params[0] || ''));

    const folder = objectPath.split('/')[0];
    if (!objectPath || LocalStorageService.isPublicFolder(folder)) {
      // Public objects are served by the static handler; routing them through
      // here would only add an auth check the caller can bypass anyway.
      throw new NotFoundException();
    }

    // Ownership: the file must be referenced by a completion in the caller's
    // family. A 404 rather than a 403 — a family should not learn that
    // another family's proof exists.
    const url = `/api/v1/files/${objectPath}`;
    const completion = await this.db.findFirst('completions', { proofUrl: url });
    if (!completion || completion.familyId !== user.familyId) {
      throw new NotFoundException();
    }

    const stream = this.storage.openPrivate(objectPath);
    if (!stream) throw new NotFoundException();

    // Private and user-specific: must never land in a shared cache.
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Never render in the browsing context — these are user-supplied files.
    res.setHeader('Content-Disposition', 'attachment');

    stream.on('error', () => {
      if (!res.headersSent) res.status(404).end();
      else res.end();
    });
    stream.pipe(res);
  }
}
