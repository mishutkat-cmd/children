import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateAudioRequestDto {
  /** Кого просим записать: userId ребёнка или его childProfileId. */
  @IsString()
  childId: string;

  /**
   * Сколько секунд записать. Ограничено сверху: это «короткая запись, что
   * вокруг», а не длительное прослушивание — и по смыслу, и для ревью сторов.
   */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  durationSec?: number;
}

export class SetConsentDto {
  @IsBoolean()
  enabled: boolean;
}
