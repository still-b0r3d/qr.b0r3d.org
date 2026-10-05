import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type DarkModePreference = 'light' | 'dark' | 'system'
const colorSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

const STORAGE_KEY = 'dark-mode-preference'

function getLocalStoragePreference(): DarkModePreference | null {
  try {
    return localStorage.getItem(STORAGE_KEY) as DarkModePreference | null
  } catch {
    return null
  }
}

function getMediaPreference(): DarkModePreference {
  const hasDarkPreference = colorSchemeMediaQuery.matches
  return hasDarkPreference ? 'dark' : 'light'
}

// Dark is the default; index.html applies the same rule before the app loads
// so there is no flash of the light theme.
function getDarkModePreference(): DarkModePreference {
  return getLocalStoragePreference() ?? 'dark'
}

function getIsDarkMode(): boolean {
  const darkModePreference = getDarkModePreference()
  return (
    darkModePreference === 'dark' ||
    (darkModePreference === 'system' && getMediaPreference() === 'dark')
  )
}

const useDarkModePreference = () => {
  const darkModePreference = ref<DarkModePreference>(getDarkModePreference())
  const isDarkModePreferenceSetBySystem = computed(() => darkModePreference.value === 'system')
  const isDarkMode = ref<boolean>(getIsDarkMode())

  const updateUiBasedOnDarkMode = () => {
    const isDark = getIsDarkMode()
    isDarkMode.value = isDark
    if (isDark && !document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.add('dark')
    } else if (!isDark && document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark')
    }
  }

  watch(darkModePreference, updateUiBasedOnDarkMode, { immediate: true })

  function setDarkModePreference(theme: DarkModePreference) {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* preference still applies for this visit */
    }
    darkModePreference.value = theme
  }

  // Starting from the dark default, one click gives light, the next follows
  // the system setting.
  const preferences: DarkModePreference[] = ['dark', 'light', 'system']
  function toggleDarkModePreference(): void {
    const updatedPreference =
      preferences[(preferences.indexOf(darkModePreference.value) + 1) % preferences.length]
    setDarkModePreference(updatedPreference)
  }

  function updateDarkModePreferenceIfSystemPreferenceChanges() {
    console.log(
      'updateDarkModePreferenceIfSystemPreferenceChanges',
      isDarkModePreferenceSetBySystem.value
    )
    if (isDarkModePreferenceSetBySystem.value) {
      updateUiBasedOnDarkMode()
    }
  }

  onMounted(() => {
    colorSchemeMediaQuery.addEventListener(
      'change',
      updateDarkModePreferenceIfSystemPreferenceChanges
    )
  })

  onBeforeUnmount(() => {
    colorSchemeMediaQuery.removeEventListener(
      'change',
      updateDarkModePreferenceIfSystemPreferenceChanges
    )
  })

  return {
    isDarkMode,
    darkModePreference,
    isDarkModePreferenceSetBySystem,
    setDarkModePreference,
    toggleDarkModePreference
  }
}

export default useDarkModePreference
