import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocStore } from '../db/doc-store.service';

/**
 * Age-based retention.
 *
 * Firestore never expired these collections either, but nothing here is
 * bounded: notifications accumulate one row per approval, completions one per
 * task done. Both grow for as long as the family uses the product.
 *
 * Each window is configured independently, in days, and a window of 0 (or an
 * unset variable) disables that sweep. They are separated because the two
 * carry very different weight:
 *
 *   notifications  transient UI chatter. Nothing else references them and
 *                  nothing is computed from them. Safe to expire.
 *
 *   completions    the record of what a child actually did. Ledger entries
 *                  point at them by id, the day-attribution logic reads their
 *                  performedAt, badge conditions count them, and the parent's
 *                  "tasks completed" figure is a count of them. Deleting old
 *                  ones is a product decision, not housekeeping, so it stays
 *                  off unless explicitly configured.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly db: DocStore) {}

  static windowDays(variable: string, fallback = 0): number {
    const raw = process.env[variable];
    if (raw === undefined || raw === '') return fallback;
    const days = Number(raw);
    return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  }

  private cutoff(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweep(): Promise<{ notifications: number; completions: number }> {
    const notifications = await this.sweepNotifications();
    const completions = await this.sweepCompletions();
    return { notifications, completions };
  }

  async sweepNotifications(dryRun = false): Promise<number> {
    const days = RetentionService.windowDays('NOTIFICATIONS_RETENTION_DAYS', 30);
    if (days <= 0) return 0;

    const before = this.cutoff(days);
    const where = { createdAt: { lt: before } };

    if (dryRun) return this.db.countSync('notifications', where);

    try {
      const removed = await this.db.deleteMany('notifications', where);
      if (removed > 0) {
        this.logger.log(`[retention] removed ${removed} notification(s) older than ${days} days`);
      }
      return removed;
    } catch (error: any) {
      this.logger.error(`[retention] notification sweep failed: ${error?.message}`);
      return 0;
    }
  }

  /**
   * Off by default. See the note above: this deletes history the rest of the
   * product reads, so it only runs when COMPLETIONS_RETENTION_DAYS is set.
   */
  async sweepCompletions(dryRun = false): Promise<number> {
    const days = RetentionService.windowDays('COMPLETIONS_RETENTION_DAYS', 0);
    if (days <= 0) return 0;

    const before = this.cutoff(days);
    const where = { performedAt: { lt: before } };

    if (dryRun) return this.db.countSync('completions', where);

    try {
      const removed = await this.db.deleteMany('completions', where);
      if (removed > 0) {
        this.logger.warn(
          `[retention] removed ${removed} completion(s) older than ${days} days — ledger entries referencing them now fall back to their own timestamps`,
        );
      }
      return removed;
    } catch (error: any) {
      this.logger.error(`[retention] completion sweep failed: ${error?.message}`);
      return 0;
    }
  }
}
