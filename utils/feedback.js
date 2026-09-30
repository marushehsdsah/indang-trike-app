import * as Haptics from 'expo-haptics';

// Touch feedback for the actions that matter. Every call is best-effort: a
// device without a vibrator (or an emulator) must never break an interaction.
function run(effect) {
  try {
    const result = effect();
    if (result?.catch) result.catch(() => {});
  } catch {
    // Ignore: haptics are decoration, not behaviour.
  }
}

export function tapFeedback() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function selectionFeedback() {
  run(() => Haptics.selectionAsync());
}

export function successFeedback() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function warningFeedback() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
