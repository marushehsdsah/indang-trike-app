import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { MAX_DOCUMENT_BYTES } from '../utils/driverDocuments';

// Opens the camera (`camera`) or the gallery and returns the chosen picture,
// or null when the person backs out. Throws 'camera-denied' when camera access
// was refused.
async function choose(camera, options) {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('camera-denied');
  }
  const settings = { mediaTypes: ['images'], quality: 1, ...options };
  const result = camera ? await ImagePicker.launchCameraAsync(settings) : await ImagePicker.launchImageLibraryAsync(settings);
  return result.canceled || !result.assets?.length ? null : result.assets[0];
}

// The profile picture is cut to a square by the picker, then made this many
// pixels wide and saved as a JPEG small enough for the server
// (policy.js MAX_PHOTO_BYTES).
const PHOTO_SIZE = 320;
const PHOTO_QUALITY = 0.7;

// A profile picture taken or picked, as a JPEG data URL, or null.
export async function pickProfilePhoto({ camera = false } = {}) {
  const asset = await choose(camera, { allowsEditing: true, aspect: [1, 1] });
  if (!asset) return null;
  const image = await ImageManipulator.manipulate(asset.uri).resize({ width: PHOTO_SIZE, height: PHOTO_SIZE }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY, base64: true });
  return `data:image/jpeg;base64,${saved.base64}`;
}

// A document photo keeps its whole shape (the picker's editor would cut it
// square on iOS) and enough pixels for its printed numbers to read: its long
// side is made this many pixels at most, then smaller until the JPEG fits
// MAX_DOCUMENT_BYTES.
const DOCUMENT_SIZES = [{ edge: 1600, compress: 0.6 }, { edge: 1280, compress: 0.55 }, { edge: 1024, compress: 0.5 }];
const base64Bytes = (base64) => Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

// A photo of a driver's document, taken or picked: { uri } to show it and
// { data }, the JPEG data URL to send, or null. Throws 'photo-too-large' when
// even the smallest size does not fit.
export async function pickDocumentPhoto({ camera = false } = {}) {
  const asset = await choose(camera, { allowsEditing: false });
  if (!asset) return null;
  const wide = (asset.width || 0) >= (asset.height || 0), longSide = Math.max(asset.width || 0, asset.height || 0) || Infinity;
  for (const { edge, compress } of DOCUMENT_SIZES) {
    const size = Math.min(edge, longSide);
    const image = await ImageManipulator.manipulate(asset.uri).resize(wide ? { width: size } : { height: size }).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (base64Bytes(saved.base64) <= MAX_DOCUMENT_BYTES) return { uri: saved.uri, data: `data:image/jpeg;base64,${saved.base64}` };
  }
  throw new Error('photo-too-large');
}
