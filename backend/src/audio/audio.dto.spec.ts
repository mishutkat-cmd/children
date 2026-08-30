import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAudioRequestDto } from './dto/audio.dto';

// Регрессия: раньше childId не был полем DTO, и глобальный whitelist-пайп
// отклонял запрос родителя целиком — ребёнок никогда не видел приглашение.
describe('CreateAudioRequestDto', () => {
  it('принимает childId и durationSec', () => {
    const dto = plainToInstance(CreateAudioRequestDto, { childId: 'c1', durationSec: 30 });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.childId).toBe('c1');
  });

  it('требует childId', () => {
    const dto = plainToInstance(CreateAudioRequestDto, { durationSec: 30 });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('отвергает слишком длинную запись', () => {
    const dto = plainToInstance(CreateAudioRequestDto, { childId: 'c1', durationSec: 600 });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
