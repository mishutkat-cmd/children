import { useTranslation } from 'react-i18next'
import { IconButton, Menu, MenuItem, ListItemText, Tooltip } from '@mui/material'
import LanguageIcon from '@mui/icons-material/Language'
import { useState } from 'react'
import { SUPPORTED_LANGUAGES, type SupportedLanguage, setStoredLanguage } from '../i18n'

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  uk: 'Українська',
  ru: 'Русский',
  en: 'English',
}

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const currentLang = (i18n.language?.slice(0, 2) || 'uk') as SupportedLanguage
  const effectiveLang = SUPPORTED_LANGUAGES.includes(currentLang) ? currentLang : 'uk'

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleSelect = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang)
    setStoredLanguage(lang)
    handleClose()
  }

  return (
    <>
      <Tooltip title={LANGUAGE_NAMES[effectiveLang]}>
        <IconButton
          onClick={handleOpen}
          color="inherit"
          sx={{
            p: 0.75,
            '&:hover': { bgcolor: 'action.hover' },
          }}
          aria-label="Switch language"
        >
          <LanguageIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: { minWidth: 160, borderRadius: 2 },
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <MenuItem
            key={lang}
            onClick={() => handleSelect(lang)}
            selected={effectiveLang === lang}
          >
            <ListItemText primary={LANGUAGE_NAMES[lang]} />
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
