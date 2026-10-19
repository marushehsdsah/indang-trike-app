import React, { useCallback, useEffect, useRef } from 'react';
import { Dimensions, ScrollView, TextInput } from 'react-native';
import useKeyboardHeight from '../../hooks/useKeyboardHeight';

// Room left under the focused field, so its label and error stay in view too.
const FIELD_MARGIN = 56;

// A ScrollView that keeps the focused text field above the on-screen keyboard:
// it adds the keyboard's height as scrollable space and scrolls the field into
// view whenever the keyboard opens or focus moves to another field.
// `padForKeyboard` is false inside a panel that already moves above the
// keyboard itself (it then only scrolls within its own bounds).
export default function KeyboardAwareScrollView({
  children, contentContainerStyle, padForKeyboard = true, onScroll, ...props
}) {
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const keyboardHeight = useKeyboardHeight();

  const revealFocusedField = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput?.();
    const scroll = scrollRef.current;
    if (!input?.measureInWindow || !scroll || !keyboardHeight) return;
    scroll.measureInWindow((sx, scrollTop, sw, scrollHeight) => {
      input.measureInWindow((x, top, w, height) => {
        // The part of the list the keyboard leaves visible.
        const visibleBottom = Math.min(scrollTop + scrollHeight, Dimensions.get('window').height - keyboardHeight);
        const below = top + height + FIELD_MARGIN - visibleBottom;
        const above = scrollTop - top + 8;
        if (below > 0) scroll.scrollTo({ y: offsetRef.current + below, animated: true });
        else if (above > 0) scroll.scrollTo({ y: Math.max(0, offsetRef.current - above), animated: true });
      });
    });
  }, [keyboardHeight]);

  // While the keyboard is up, reveal the focused field: once the added space
  // has laid out, then whenever focus moves to another field (the keyboard
  // stays up then, so no keyboard event says so).
  useEffect(() => {
    if (!keyboardHeight) return undefined;
    let focused = null;
    const check = () => {
      const input = TextInput.State.currentlyFocusedInput?.();
      if (input && input !== focused) { focused = input; revealFocusedField(); }
    };
    const timer = setTimeout(check, 60);
    const interval = setInterval(check, 200);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [keyboardHeight, revealFocusedField]);

  return (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      {...props}
      onScroll={(event) => { offsetRef.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}
      contentContainerStyle={[contentContainerStyle, padForKeyboard && keyboardHeight ? { paddingBottom: keyboardHeight + FIELD_MARGIN } : null]}
    >
      {children}
    </ScrollView>
  );
}
