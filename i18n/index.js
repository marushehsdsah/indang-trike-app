import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { LANGUAGES, translate } from './translate';

// The language the rider or driver chose, kept on the phone and read before
// the first screen draws, so the app never flashes the other language.
const languageFile = () => new File(Paths.document, 'indanggo-language.json');

function readLanguage() {
  try {
    const file = languageFile();
    const saved = file.exists ? JSON.parse(file.textSync()).language : null;
    return LANGUAGES.includes(saved) ? saved : 'en';
  } catch { return 'en'; }
}

function writeLanguage(language) {
  try {
    const file = languageFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ language }));
  } catch {}
}

const Context = createContext({ language: 'en', setLanguage: () => {}, t: (key, params) => translate('en', key, params) });

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readLanguage);
  const setLanguage = useCallback((next) => {
    if (!LANGUAGES.includes(next)) return;
    setLanguageState(next);
    writeLanguage(next);
  }, []);
  const value = useMemo(() => ({ language, setLanguage, t: (key, params) => translate(language, key, params) }), [language, setLanguage]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);
