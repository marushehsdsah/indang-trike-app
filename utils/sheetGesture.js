// Where a dragged bottom sheet (the trip chat) settles once let go. A fling,
// or a drag past DRAG_THRESHOLD, moves it one step: half -> full going up;
// full -> half or half -> closed going down. A shorter drag springs back.
const DRAG_THRESHOLD = 60;
const FLING_VELOCITY = 0.5;

function settleSheet(mode, dy, vy) {
  const direction = Math.abs(vy) > FLING_VELOCITY ? Math.sign(vy) : Math.abs(dy) > DRAG_THRESHOLD ? Math.sign(dy) : 0;
  if (direction < 0) return 'full';
  if (direction > 0) return mode === 'full' ? 'half' : 'closed';
  return mode;
}

module.exports = { DRAG_THRESHOLD, FLING_VELOCITY, settleSheet };
