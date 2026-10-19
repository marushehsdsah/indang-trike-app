import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// The on-screen keyboard's height, 0 while it is closed. The app draws edge to
// edge, so Android no longer shrinks the window for the keyboard: screens with
// inputs use this to keep the focused field above it.
export default function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // iOS announces the keyboard before it moves; Android only once it is up.
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subscriptions = [
      Keyboard.addListener(show, (event) => setHeight(event.endCoordinates?.height ?? 0)),
      Keyboard.addListener(hide, () => setHeight(0)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  return height;
}
