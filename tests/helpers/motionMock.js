// React Native's Animated, Easing and AccessibilityInfo for tests that draw
// components as plain elements: animations are recorded, not run, and
// "Remove animations" is whatever `motion.reduced` says.
function createMotion(React) {
  const motion = { reduced: false, animations: [] };
  class Value {
    constructor(value) { this.value = value; }
    interpolate(config) { return { interpolation: config }; }
  }
  // Each animation is recorded as { kind, config, started, stopped }; a loop's
  // or sequence's config holds the recorded animations inside it.
  const animation = (kind, config) => {
    const entry = { kind, config, started: false, stopped: false };
    entry.start = () => { entry.started = true; };
    entry.stop = () => { entry.stopped = true; };
    motion.animations.push(entry);
    return entry;
  };
  motion.Animated = {
    Value,
    View: (props) => React.createElement('Animated.View', props),
    timing: (value, config) => animation('timing', config),
    sequence: (steps) => animation('sequence', steps),
    delay: (ms) => animation('delay', ms),
    loop: (inner) => animation('loop', inner),
  };
  motion.Easing = { ease: (t) => t, inOut: (easing) => easing };
  motion.AccessibilityInfo = {
    isReduceMotionEnabled: async () => motion.reduced,
    addEventListener: () => ({ remove() {} }),
  };
  motion.LinearGradient = (props) => React.createElement('LinearGradient', props);
  return motion;
}

module.exports = { createMotion };
