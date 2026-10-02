const STRINGS = require('./strings');

const LANGUAGES = ['en', 'fil'];

// The text for a key in the chosen language, with {name} placeholders filled
// in. A key missing from Filipino falls back to English rather than showing
// the key itself.
function translate(language, key, params) {
  const template = STRINGS[language]?.[key] ?? STRINGS.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

module.exports = { LANGUAGES, STRINGS, translate };
