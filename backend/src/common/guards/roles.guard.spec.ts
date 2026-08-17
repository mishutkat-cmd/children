import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Roles } from '../decorators/roles.decorator';

/**
 * Регрессия: раньше guard читал метаданные только с обработчика, и
 * @Roles('PARENT') на классе не значил ничего — ребёнок с валидным токеном
 * проходил в родительские эндпоинты. Тесты фиксируют обе половины контракта:
 * классовый декоратор работает, методный его перекрывает.
 */

@Roles('PARENT')
class ParentOnlyController {
  listChildren() {}

  @Roles('CHILD')
  mySummary() {}

  @Roles('PARENT', 'CHILD')
  uploadAvatar() {}
}

class NoRolesController {
  publicish() {}
}

const contextFor = (
  controller: new () => any,
  method: string,
  user: { role: string } | null,
): ExecutionContext =>
  ({
    getHandler: () => controller.prototype[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('применяет @Roles с класса, когда у метода своего нет', () => {
    expect(guard.canActivate(contextFor(ParentOnlyController, 'listChildren', { role: 'PARENT' }))).toBe(true);
    expect(guard.canActivate(contextFor(ParentOnlyController, 'listChildren', { role: 'CHILD' }))).toBe(false);
  });

  it('декоратор на методе перекрывает классовый', () => {
    expect(guard.canActivate(contextFor(ParentOnlyController, 'mySummary', { role: 'CHILD' }))).toBe(true);
    expect(guard.canActivate(contextFor(ParentOnlyController, 'mySummary', { role: 'PARENT' }))).toBe(false);
  });

  it('поддерживает несколько ролей на методе', () => {
    expect(guard.canActivate(contextFor(ParentOnlyController, 'uploadAvatar', { role: 'CHILD' }))).toBe(true);
    expect(guard.canActivate(contextFor(ParentOnlyController, 'uploadAvatar', { role: 'PARENT' }))).toBe(true);
  });

  it('без метаданных пропускает любого аутентифицированного', () => {
    expect(guard.canActivate(contextFor(NoRolesController, 'publicish', { role: 'CHILD' }))).toBe(true);
  });

  it('не пропускает запрос без пользователя', () => {
    expect(guard.canActivate(contextFor(ParentOnlyController, 'listChildren', null))).toBe(false);
  });
});
