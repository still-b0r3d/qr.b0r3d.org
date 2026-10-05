import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'

// b0r3d QR is English only: the language picker was removed so nobody can end
// up stuck in a language they can't read. The strings still go through t(),
// and Mini QR's translations are kept in locales/ in case that comes back.
export const i18n = createI18n({
  locale: 'en',
  legacy: false,
  messages: { en }
})
