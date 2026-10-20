import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

// How much of the window the on-screen keyboard covers, 0 while it is closed.
// The app draws edge to edge, so Android no longer shrinks the window for the
// keyboard: screens with inputs use this to keep the focused field above it.
// Android's reported keyboard height leaves out the navigation bar below the
// keyboard, so the keyboard's top edge is measured from the window's bottom.
export function coveredHeight({ height = 0, screenY } = {}) {
  const fromTop = Dimensions.get('window').height - screenY;
  return Number.isFinite(fromTop) && screenY > 0 ? Math.max(height, Math.round(fromTop)) : height;
}

export default function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // iOS announces the keyboard before it moves; Android only once it is up.
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subscriptions = [
      Keyboard.addListener(show, (event) => setHeight(coveredHeight(event.endCoordinates))),
      Keyboard.addListener(hide, () => setHeight(0)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  return height;
}
