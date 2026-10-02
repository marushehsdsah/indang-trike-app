import React from 'react';
import { SegmentedControl } from './ui/Surfaces';
import { useI18n } from '../i18n';

// English or Filipino; the choice is saved on the phone and applies at once.
export default function LanguageToggle({ style, tone }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <SegmentedControl
      tone={tone}
      value={language}
      onChange={setLanguage}
      options={[
        { value: 'en', label: 'English', accessibilityLabel: t('language.english') },
        { value: 'fil', label: 'Filipino', accessibilityLabel: t('language.filipino') },
      ]}
      style={style}
    />
  );
}
