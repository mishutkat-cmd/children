import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateAudioRequestDto {
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
