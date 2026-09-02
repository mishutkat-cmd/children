/**
 * Грубая категоризация приложений по package name.
 *
 * Точную категорию знает только Android (ApplicationInfo.category), но
 * bridge-библиотека usage-stats её не отдаёт. Словарь покрывает популярные
 * приложения; всё незнакомое попадает в «Другое». Родителю важна не
 * академическая точность, а картина «видео/игры/соцсети/учёба».
 */
export type Category =
  | 'Видео'
  | 'Игры'
  | 'Соцсети'
  | 'Мессенджеры'
  | 'Учёба'
  | 'Музыка'
  | 'Браузер'
  | 'Другое';

const MAP: Record<string, Category> = {
  // Видео
  'com.google.android.youtube': 'Видео',
  'com.google.android.apps.youtube.kids': 'Видео',
  'com.netflix.mediaclient': 'Видео',
  'com.amazon.avod.thirdpartyclient': 'Видео',
  'ru.kinopoisk': 'Видео',
  'com.ivi.client': 'Видео',
  'tv.twitch.android.app': 'Видео',
  // Соцсети / короткие видео
  'com.zhiliaoapp.musically': 'Соцсети',
  'com.instagram.android': 'Соцсети',
  'com.facebook.katana': 'Соцсети',
  'com.snapchat.android': 'Соцсети',
  'com.twitter.android': 'Соцсети',
  'com.vkontakte.android': 'Соцсети',
  'ru.ok.android': 'Соцсети',
  'com.pinterest': 'Соцсети',
  // Мессенджеры
  'org.telegram.messenger': 'Мессенджеры',
  'com.whatsapp': 'Мессенджеры',
  'com.viber.voip': 'Мессенджеры',
  'com.discord': 'Мессенджеры',
  'com.google.android.apps.messaging': 'Мессенджеры',
  // Игры (популярные)
  'com.roblox.client': 'Игры',
  'com.mojang.minecraftpe': 'Игры',
  'com.supercell.brawlstars': 'Игры',
  'com.supercell.clashofclans': 'Игры',
  'com.supercell.clashroyale': 'Игры',
  'com.tencent.ig': 'Игры',
  'com.pubg.krmobile': 'Игры',
  'com.miHoYo.GenshinImpact': 'Игры',
  'com.axlebolt.standoff2': 'Игры',
  'com.innersloth.spacemafia': 'Игры',
  'com.king.candycrushsaga': 'Игры',
  'com.nianticlabs.pokemongo': 'Игры',
  // Учёба
  'com.duolingo': 'Учёба',
  'com.google.android.apps.classroom': 'Учёба',
  'org.khanacademy.android': 'Учёба',
  'com.photomath': 'Учёба',
  'com.quizlet.quizletandroid': 'Учёба',
  // Музыка
  'com.spotify.music': 'Музыка',
  'ru.yandex.music': 'Музыка',
  'com.google.android.apps.youtube.music': 'Музыка',
  'deezer.android.app': 'Музыка',
  // Браузеры
  'com.android.chrome': 'Браузер',
  'org.mozilla.firefox': 'Браузер',
  'com.opera.browser': 'Браузер',
  'com.yandex.browser': 'Браузер',
};

export function categorize(packageName: string): Category {
  if (MAP[packageName]) return MAP[packageName];
  const p = packageName.toLowerCase();
  if (p.includes('game') || p.includes('games')) return 'Игры';
  if (p.includes('browser')) return 'Браузер';
  if (p.includes('messeng') || p.includes('chat')) return 'Мессенджеры';
  return 'Другое';
}
