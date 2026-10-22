const test = require('node:test');
const assert = require('node:assert/strict');
const { censorText, containsProfanity } = require('../utils/profanity');
const { validateRegistration } = require('../utils/registration');

test('English and Filipino offensive words are hidden behind their first letter', () => {
  assert.deepEqual(censorText('Putangina mo'), { text: 'P******** mo', censored: true });
  assert.equal(censorText('ang gago mo').text, 'ang g*** mo');
  assert.equal(censorText('Tanga ka ba').text, 'T**** ka ba');
  assert.equal(censorText('Gagong driver').text, 'G***** driver', 'Filipino -ng ending');
  assert.equal(censorText('this is bullshit').text, 'this is b*******');
  assert.equal(censorText('fucking traffic').text, 'f****** traffic', 'inside a longer word');
  assert.equal(censorText('Damn it').text, 'D*** it', 'irreverent');
});

test('disguised spellings are caught', () => {
  for (const disguised of ['sh1t', '$hit', 'g@go', 'fuuuuck', 'f.u.c.k', 'f*ck', 'p.u.t.a', 'B0B0']) {
    assert.equal(censorText(disguised).censored, true, disguised);
  }
  assert.equal(censorText('f u c k this').text, 'f * * * this', 'letters spaced apart');
});

test('everyday messages and place names are left alone', () => {
  for (const clean of ['Salamat po, ingat!', 'Nasa tapat po ako ng Bukana', 'I passed the class assignment', 'assessment',
    'He is in Tanauan, Batangas', 'Puto at bibingka', 'Kaytapos upland', 'sa may tulay po', 'assist ko po', 'Titing', 'Dickens', 'I am at the plaza by 7:30']) {
    assert.deepEqual(censorText(clean), { text: clean, censored: false }, clean);
  }
  assert.equal(containsProfanity(''), false);
  assert.equal(containsProfanity(undefined), false);
});

test('a name with offensive words is refused at sign-up', () => {
  const form = { firstName: 'Juan', lastName: 'Gago', email: 'juan@gmail.com', phone: '09171234567', password: 'strong-password',
    confirmPassword: 'strong-password', acceptedTerms: true };
  assert.equal(validateRegistration(form), 'Please use a respectful name.');
  assert.equal(validateRegistration({ ...form, lastName: 'Dela Cruz' }), null);
});

test('punctuation around a hidden word stays', () => {
  assert.equal(censorText('Nasaan ka na, t4nga?').text, 'Nasaan ka na, t****?');
  assert.equal(censorText('(gago)').text, '(g***)');
  assert.equal(censorText('"fuck!"').text, '"f***!"');
});
