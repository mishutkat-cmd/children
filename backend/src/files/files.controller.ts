import { Controller, Get, NotFoundException, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { DocStore } from '../db/doc-store.service';
import { LocalStorageService } from './local-storage.service';
import { verifyFileSignature } from './file-signing';

/**
 * Serves private uploads — today only proof photos.
 *
 * Two ways in, because the two callers cannot use the same one:
 *
 *   signature  the UI renders these with `<img src>` and `window.open`, which
 *              send no headers at all. The signed, expiring URL handed out by
 *              SignPrivateUrlsInterceptor is the authorization, exactly as
 *              Firebase's signed URLs were.
 *   token      a direct API caller with a Bearer token, additionally checked
 *              against the family that owns the referencing completion.
 *
 * The static handler never sees this directory, so an unsigned, unauthenticated
 * request cannot reach the file by any route.
 */
@Controller('api/v1/files')
export class FilesController {
  constructor(
    private readonly storage: LocalStorageService,
    private readonly db: DocStore,
    private readonly jwt: JwtService,
  ) {}

  @Get('*')
  async serve(
    @Req() req: Request,
    @Res() res: Response,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
  ) {
    const objectPath = decodeURIComponent(String(req.params[0] || ''));

    const folder = objectPath.split('/')[0];
    if (!objectPath || LocalStorageService.isPublicFolder(folder)) {
      // Public objects are served by the static handler.
      throw new NotFoundException();
    }

    if (!verifyFileSignature(objectPath, exp, sig)) {
      await this.authorizeByToken(req, objectPath);
    }

    const stream = this.storage.openPrivate(objectPath);
    if (!stream) throw new NotFoundException();

    // Content type is sniffed from the bytes on disk, not taken from the file
    // name, and only ever resolves to one of the image types the upload
    // endpoint accepts. Serving `application/octet-stream` here would make the
    // photo un-renderable in the `<img>` tag that displays it.
    const contentType = await this.storage.sniffContentType(objectPath);
    if (!contentType) throw new NotFoundException();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    // Belt and braces: the type is sniffed and restricted, and the browser is
    // told not to second-guess it.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Private and short-lived. `private` keeps it out of shared caches; the
    // signature expires anyway.
    res.setHeader('Cache-Control', 'private, max-age=300');

    stream.on('error', () => {
      if (!res.headersSent) res.status(404).end();
      else res.end();
    });
    stream.pipe(res);
  }

  /**
   * Fallback path for API clients holding a Bearer token: the caller's family
   * must own a completion that references this file. A 404 rather than a 403 —
   * one family should not learn that another family's proof exists.
   */
  private async authorizeByToken(req: Request, objectPath: string): Promise<void> {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException();

    let familyId: string;
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET });
      familyId = (payload as any)?.familyId;
    } catch {
      throw new UnauthorizedException();
    }
    if (!familyId) throw new UnauthorizedException();

    const completion = await this.db.findFirst('completions', {
      proofUrl: `/api/v1/files/${objectPath}`,
    });
    if (!completion || completion.familyId !== familyId) throw new NotFoundException();
  }
}
