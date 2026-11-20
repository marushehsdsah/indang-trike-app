const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, flush, deferred, React, renderer } = require('./helpers/reactHarness');

// The sign-up form's document photos (components/DocumentPhotos.js), with
// React Native's components drawn as plain elements and the picker faked.
const alerts = [];
const host = (name) => name;
const reactNative = {
  View: host('View'), Text: host('Text'), Pressable: host('Pressable'), Image: host('Image'), ActivityIndicator: host('ActivityIndicator'),
  StyleSheet: { create: (styles) => styles }, Alert: { alert: (...args) => alerts.push(args) },
};
// The option sheet runs a choice straight away, as if its fade had ended.
const OptionSheet = ({ visible, title, options, onClose }) => (visible ? React.createElement('OptionSheet', { title },
  options.map((option) => React.createElement('Option', { key: option.label, label: option.label, onPress: () => { onClose(); return option.onPress(); } }))) : null);
const picks = [];
let nextPhoto = null;
const pickDocumentPhoto = async (options) => { picks.push(options); if (nextPhoto instanceof Error) throw nextPhoto; return nextPhoto; };
const STRINGS = require('../i18n/strings');
const t = (key) => STRINGS.en[key] ?? key;
const DocumentPhotos = loadSource('components/DocumentPhotos.js', {
  react: React, 'react-native': reactNative, '@expo/vector-icons': { MaterialCommunityIcons: host('Icon') },
  './OptionSheet': { __esModule: true, default: OptionSheet }, './pickPhoto': { pickDocumentPhoto },
  './ui/Skeleton': { Skeleton: host('Skeleton'), Bone: host('Bone') },
  '../i18n': { useI18n: () => ({ t }) }, '../theme': loadSource('theme.js', {}),
}).default;

const textOf = (node) => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''));
const texts = (root) => root.findAll((node) => node.type === 'Text').map(textOf);
const slot = (root, label) => root.find((node) => node.type === 'Pressable' && node.props.accessibilityLabel.startsWith(`${label}.`));
const choose = (root, label) => renderer.act(async () => { await root.find((node) => node.type === 'Option' && node.props.label === label).props.onPress(); });

test('a driver adds, changes and removes a photo of each document from the camera or the gallery', async () => {
  let documents = {};
  const changes = [];
  const Form = () => {
    const [current, setCurrent] = React.useState({});
    documents = current;
    return React.createElement(DocumentPhotos, { documents: current, onChange: (kind, photo) => { changes.push([kind, photo]); setCurrent((value) => ({ ...value, [kind]: photo })); } });
  };
  let tree;
  await renderer.act(async () => { tree = renderer.create(React.createElement(Form)); });
  const shown = texts(tree.root);
  for (const text of ['Documents', 'Driver’s license', 'Registration (OR/CR)', 'Franchise (MTOP)', 'Tap to add a photo showing the franchise number']) assert.ok(shown.includes(text), text);
  assert.equal(tree.root.findAll((node) => node.type === 'Image').length, 0);

  // The camera fills the license slot, which then shows the photo.
  await renderer.act(async () => slot(tree.root, 'Driver’s license').props.onPress());
  const sheet = tree.root.find((node) => node.type === 'OptionSheet');
  assert.equal(sheet.props.title, 'Driver’s license');
  assert.deepEqual(sheet.findAll((node) => node.type === 'Option').map((node) => node.props.label), ['Take a photo', 'Choose from gallery'], 'nothing to remove yet');
  nextPhoto = { uri: 'file:///license.jpg', data: 'data:image/jpeg;base64,/9j/AA==' };
  await choose(tree.root, 'Take a photo');
  await flush();
  assert.deepEqual(picks.at(-1), { camera: true });
  assert.deepEqual(documents.license, nextPhoto);
  assert.equal(tree.root.find((node) => node.type === 'Image').props.source.uri, 'file:///license.jpg');
  assert.equal(slot(tree.root, 'Driver’s license').props.accessibilityLabel, 'Driver’s license. Added · tap to change');

  // Backing out of the gallery changes nothing; Remove empties the slot.
  nextPhoto = null;
  await renderer.act(async () => slot(tree.root, 'Driver’s license').props.onPress());
  await choose(tree.root, 'Choose from gallery');
  assert.deepEqual(picks.at(-1), { camera: false });
  assert.equal(changes.length, 1);
  await renderer.act(async () => slot(tree.root, 'Driver’s license').props.onPress());
  await choose(tree.root, 'Remove photo');
  assert.deepEqual(changes.at(-1), ['license', null]);
  assert.equal(tree.root.findAll((node) => node.type === 'Image').length, 0);

  // A refused camera, or a photo too detailed to shrink, says what to do.
  for (const [failure, message] of [['camera-denied', STRINGS.en['profile.cameraDenied']], ['photo-too-large', STRINGS.en['register.documentTooLarge']]]) {
    nextPhoto = new Error(failure);
    await renderer.act(async () => slot(tree.root, 'Franchise (MTOP)').props.onPress());
    await choose(tree.root, 'Take a photo');
    assert.deepEqual(alerts.at(-1), ['Unable to add the photo', message]);
  }
  assert.equal(documents.franchise, undefined);

  // While a picked photo is made smaller, its box shimmers.
  const shrinking = deferred();
  nextPhoto = shrinking.promise;
  await renderer.act(async () => slot(tree.root, 'Registration (OR/CR)').props.onPress());
  let picking;
  await renderer.act(async () => { picking = tree.root.find((node) => node.type === 'Option' && node.props.label === 'Take a photo').props.onPress(); });
  const shimmers = () => slot(tree.root, 'Registration (OR/CR)').findAll((node) => node.type === 'Skeleton').length;
  assert.equal(shimmers(), 1);
  assert.equal(slot(tree.root, 'Registration (OR/CR)').props.accessibilityState.busy, true);
  await renderer.act(async () => { shrinking.resolve({ uri: 'file:///registration.jpg', data: 'data:image/jpeg;base64,/9j/BB==' }); await picking; });
  assert.equal(shimmers(), 0);
  assert.equal(slot(tree.root, 'Registration (OR/CR)').find((node) => node.type === 'Image').props.source.uri, 'file:///registration.jpg');
});
