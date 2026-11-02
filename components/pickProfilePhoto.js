import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// The profile picture is cut to a square by the picker, then made this many
// pixels wide and saved as a JPEG small enough for the server
// (policy.js MAX_PHOTO_BYTES).
const PHOTO_SIZE = 320;
const PHOTO_QUALITY = 0.7;

// Takes a photo with the camera (`camera`) or picks one from the gallery and
// returns it as a JPEG data URL, or null when the person backs out. Throws
// 'camera-denied' when camera access was refused.
export default async function pickProfilePhoto({ camera = false } = {}) {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('camera-denied');
  }
  const options = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const image = await ImageManipulator.manipulate(result.assets[0].uri).resize({ width: PHOTO_SIZE, height: PHOTO_SIZE }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY, base64: true });
  return `data:image/jpeg;base64,${saved.base64}`;
}
