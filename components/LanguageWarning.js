import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { warningFeedback } from '../utils/feedback';

// Warns the person, with a buzz, each time the server hid offensive words from
// a chat message, pickup note or rating they sent (utils/profanity.js). The
// warning is also counted on their account for admins. Renders nothing.
export default function LanguageWarning() {
  const { languageWarning } = useApp();
  const { t } = useI18n();
  const shown = useRef(languageWarning);
  useEffect(() => {
    if (languageWarning <= shown.current) return;
    shown.current = languageWarning;
    warningFeedback();
    Alert.alert(t('language.title'), t('language.message'));
  }, [languageWarning, t]);
  return null;
}
