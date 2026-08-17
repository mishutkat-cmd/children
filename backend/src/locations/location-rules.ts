import type { LocationPointDto } from './dto/locations.dto';

/**
 * Чистые правила отсева геоточек — без Firestore и без Nest, чтобы их можно
 * было проверить тестами. Клиент фильтрует у себя, но доверять клиенту нельзя:
 * старый билд, подделанные координаты или залежавшаяся очередь приходят сюда.
 */

/** Хуже этого — мусор от позиционирования по вышкам, в историю не пускаем. */
export const MAX_ACCURACY_M = 200;
/** Точка «из будущего» дальше этого — рассинхрон часов устройства. */
export const FUTURE_SKEW_MS = 2 * 60 * 1000;
/** Старее суток — скорее всего залежалась очередь после долгого офлайна. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Физически невозможная скорость между соседними точками — телепорт. */
export const MAX_PLAUSIBLE_SPEED_MPS = 60; // ~216 км/ч

export interface PreparedPoint extends LocationPointDto {
  ts: number;
}

export interface PreviousFix {
  lat?: number | null;
  lng?: number | null;
  ts?: number;
}

/** Расстояние между двумя координатами в метрах. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Отсев и нормализация батча.
 *
 * Порядок важен: сначала выбрасываем битые метки времени и плохую точность,
 * потом дедуплицируем по секунде (ретрай очереди присылает те же точки), и
 * только затем ищем телепорты — по уже упорядоченной цепочке.
 */
export function sanitizePoints(
  raw: LocationPointDto[],
  previous: PreviousFix | null,
  now: number = Date.now(),
): { points: PreparedPoint[]; rejected: number } {
  let rejected = 0;
  const candidates: PreparedPoint[] = [];

  for (const p of raw) {
    const ts = Date.parse(p.capturedAt);
    if (!Number.isFinite(ts) || ts > now + FUTURE_SKEW_MS || now - ts > MAX_AGE_MS) {
      rejected++;
      continue;
    }
    if (p.accuracy > MAX_ACCURACY_M) {
      rejected++;
      continue;
    }
    candidates.push({ ...p, ts });
  }

  // Дедуп по секунде: из дублей оставляем самый точный фикс.
  const bySecond = new Map<number, PreparedPoint>();
  for (const p of candidates.sort((a, b) => a.ts - b.ts)) {
    const key = Math.floor(p.ts / 1000) * 1000;
    const existing = bySecond.get(key);
    if (!existing || p.accuracy < existing.accuracy) {
      bySecond.set(key, { ...p, ts: key });
    }
  }
  rejected += candidates.length - bySecond.size;

  let prevLat = typeof previous?.lat === 'number' ? previous.lat : null;
  let prevLng = typeof previous?.lng === 'number' ? previous.lng : null;
  let prevTs = previous?.ts ?? 0;
  const points: PreparedPoint[] = [];

  for (const p of Array.from(bySecond.values()).sort((a, b) => a.ts - b.ts)) {
    if (prevLat !== null && prevLng !== null && prevTs > 0 && p.ts > prevTs) {
      const meters = haversineMeters(prevLat, prevLng, p.lat, p.lng);
      const seconds = (p.ts - prevTs) / 1000;
      // Погрешность самой точки не считаем перемещением.
      const traveled = Math.max(0, meters - p.accuracy);
      if (seconds > 0 && traveled / seconds > MAX_PLAUSIBLE_SPEED_MPS) {
        rejected++;
        continue;
      }
    }
    points.push(p);
    prevLat = p.lat;
    prevLng = p.lng;
    prevTs = p.ts;
  }

  return { points, rejected };
}

/**
 * Есть ли у записи пригодные к показу координаты.
 *
 * Документ последней точки создаётся не только приёмом координат: родительский
 * «обновить сейчас» пишет туда флаг refreshRequestedAt ещё до того, как ребёнок
 * прислал хоть один фикс. Без этой проверки наружу уезжает точка с lat/lng
 * undefined, и карта на клиенте падает.
 */
export function hasCoordinates(doc: any): boolean {
  return (
    !!doc &&
    typeof doc.lat === 'number' &&
    Number.isFinite(doc.lat) &&
    typeof doc.lng === 'number' &&
    Number.isFinite(doc.lng)
  );
}
