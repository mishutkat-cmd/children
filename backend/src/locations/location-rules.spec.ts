import { hasCoordinates, haversineMeters, sanitizePoints } from './location-rules';
import type { LocationPointDto } from './dto/locations.dto';

const NOW = Date.parse('2026-08-17T12:00:00.000Z');

const point = (over: Partial<LocationPointDto> & { capturedAt: string }): LocationPointDto => ({
  lat: 55.7512,
  lng: 37.6184,
  accuracy: 20,
  ...over,
});

const at = (offsetSec: number) => new Date(NOW + offsetSec * 1000).toISOString();

describe('haversineMeters', () => {
  it('считает расстояние между известными точками', () => {
    // Красная площадь → Лужники, ~5.6 км по прямой.
    const meters = haversineMeters(55.7539, 37.6208, 55.7158, 37.5535);
    expect(meters).toBeGreaterThan(5000);
    expect(meters).toBeLessThan(6500);
  });

  it('возвращает 0 для одной и той же точки', () => {
    expect(haversineMeters(55.75, 37.61, 55.75, 37.61)).toBe(0);
  });
});

describe('sanitizePoints', () => {
  it('пропускает нормальный батч', () => {
    const { points, rejected } = sanitizePoints(
      [point({ capturedAt: at(-120) }), point({ capturedAt: at(-60), lat: 55.7515 })],
      null,
      NOW,
    );
    expect(points).toHaveLength(2);
    expect(rejected).toBe(0);
  });

  it('сортирует точки по времени независимо от порядка в батче', () => {
    const { points } = sanitizePoints(
      [point({ capturedAt: at(-10) }), point({ capturedAt: at(-300) })],
      null,
      NOW,
    );
    expect(points.map((p) => p.capturedAt)).toEqual([at(-300), at(-10)]);
  });

  it('отбрасывает точки с плохой точностью', () => {
    const { points, rejected } = sanitizePoints(
      [point({ capturedAt: at(-60), accuracy: 500 })],
      null,
      NOW,
    );
    expect(points).toHaveLength(0);
    expect(rejected).toBe(1);
  });

  it('отбрасывает точки из будущего и слишком старые', () => {
    const { points, rejected } = sanitizePoints(
      [
        point({ capturedAt: at(600) }), // +10 минут — часы устройства уехали
        point({ capturedAt: at(-48 * 3600) }), // двое суток назад
        point({ capturedAt: 'не дата' }),
      ],
      null,
      NOW,
    );
    expect(points).toHaveLength(0);
    expect(rejected).toBe(3);
  });

  it('принимает небольшой сдвиг часов вперёд', () => {
    const { points } = sanitizePoints([point({ capturedAt: at(30) })], null, NOW);
    expect(points).toHaveLength(1);
  });

  it('дедуплицирует повторную отправку и оставляет самый точный фикс', () => {
    const { points } = sanitizePoints(
      [
        point({ capturedAt: at(-60), accuracy: 50 }),
        point({ capturedAt: at(-60), accuracy: 12 }),
      ],
      null,
      NOW,
    );
    expect(points).toHaveLength(1);
    expect(points[0].accuracy).toBe(12);
  });

  it('отбрасывает телепорт относительно последней сохранённой точки', () => {
    // 200 км за минуту — физически невозможно.
    const { points, rejected } = sanitizePoints(
      [point({ capturedAt: at(-60), lat: 57.5512, lng: 37.6184 })],
      { lat: 55.7512, lng: 37.6184, ts: NOW - 120_000 },
      NOW,
    );
    expect(points).toHaveLength(0);
    expect(rejected).toBe(1);
  });

  it('не считает телепортом поездку на машине', () => {
    // ~1 км за минуту = 60 км/ч.
    const { points } = sanitizePoints(
      [point({ capturedAt: at(-60), lat: 55.7602, lng: 37.6184 })],
      { lat: 55.7512, lng: 37.6184, ts: NOW - 120_000 },
      NOW,
    );
    expect(points).toHaveLength(1);
  });

  it('не считает перемещением дрожание в пределах погрешности', () => {
    // Сдвиг ~15 м при погрешности 100 м и нулевом интервале времени
    // не должен выглядеть как бесконечная скорость.
    const { points } = sanitizePoints(
      [point({ capturedAt: at(-60), lat: 55.75133, accuracy: 100 })],
      { lat: 55.7512, lng: 37.6184, ts: NOW - 61_000 },
      NOW,
    );
    expect(points).toHaveLength(1);
  });

  it('фильтрует цепочку последовательно, а не только первую точку', () => {
    const { points } = sanitizePoints(
      [
        point({ capturedAt: at(-180), lat: 55.7512 }),
        point({ capturedAt: at(-120), lat: 60.0 }), // выброс
        point({ capturedAt: at(-60), lat: 55.7515 }), // снова рядом с первой
      ],
      null,
      NOW,
    );
    expect(points).toHaveLength(2);
    expect(points.every((p) => p.lat < 56)).toBe(true);
  });
});

describe('hasCoordinates', () => {
  it('пропускает документ с нормальными координатами', () => {
    expect(hasCoordinates({ lat: 55.75, lng: 37.61 })).toBe(true);
    expect(hasCoordinates({ lat: 0, lng: 0 })).toBe(true);
  });

  it('отсекает запись, созданную запросом «обновить сейчас»', () => {
    // Именно из-за неё карта падала: документ есть, координат в нём нет.
    expect(hasCoordinates({ childId: 'c1', familyId: 'f1', refreshRequestedAt: new Date() })).toBe(false);
  });

  it('отсекает пустое, битое и нечисловое', () => {
    expect(hasCoordinates(null)).toBe(false);
    expect(hasCoordinates(undefined)).toBe(false);
    expect(hasCoordinates({})).toBe(false);
    expect(hasCoordinates({ lat: '55.75', lng: '37.61' })).toBe(false);
    expect(hasCoordinates({ lat: NaN, lng: 37.61 })).toBe(false);
    expect(hasCoordinates({ lat: 55.75 })).toBe(false);
  });
});
