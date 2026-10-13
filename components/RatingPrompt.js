import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from './ui/Button';
import Field from './ui/Field';
import { Avatar, Chip } from './ui/Surfaces';
import { useApp } from '../context/AppContext';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { selectionFeedback, successFeedback, warningFeedback } from '../utils/feedback';
import { MAX_COMMENT_LENGTH, SAFETY_TAGS, STAR_LABELS, tagsFor } from '../utils/rating';
import { userName } from '../utils/rideState';

export function Stars({ value, size = 18, style }) {
  return (
    <View style={[styles.starsRow, style]} accessibilityLabel={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <MaterialCommunityIcons key={star} name={star <= value ? 'star' : 'star-outline'} size={size}
          color={star <= value ? COLORS.accent : COLORS.lineStrong} />
      ))}
    </View>
  );
}

// After a completed ride: the passenger rates the driver, the driver rates the
// passenger. Once rated it shows the given stars. onSkip hides it for now; the
// ride can still be rated from History.
export default function RatingPrompt({ ride, asDriver, onSkip, onRated, style }) {
  const { rateRide } = useApp();
  const person = asDriver ? ride.passenger : ride.driver;
  const rateeRole = asDriver ? 'passenger' : 'driver';
  const [stars, setStars] = useState(0), [tags, setTags] = useState([]), [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);

  if (ride.myRating) {
    return (
      <View style={[styles.card, styles.done, style]}>
        <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.brand} />
        <Text style={[TYPE.captionStrong, styles.doneText]}>You rated {person ? userName(person) : `your ${rateeRole}`}</Text>
        <Stars value={ride.myRating.stars} size={16} />
      </View>
    );
  }

  const choose = (value) => {
    selectionFeedback();
    // Praise and concern tags differ, so a switch across 3/4 clears them.
    if ((value >= 4) !== (stars >= 4)) setTags([]);
    setStars(value); setError(null);
  };
  const toggle = (tag) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const submit = async () => {
    if (!stars || busy) return;
    setBusy(true); setError(null);
    try { await rateRide(ride.id, { stars, tags, comment }); successFeedback(); onRated?.(); }
    catch (failure) { warningFeedback(); setError(failure.message); }
    finally { setBusy(false); }
  };
  const safety = tags.some((tag) => SAFETY_TAGS.has(tag));

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        {person && <Avatar name={userName(person)} size={44} />}
        <View style={styles.headerText}>
          <Text style={TYPE.subheading}>Rate your {rateeRole}</Text>
          <Text style={TYPE.caption}>{person ? `How was your trip with ${person.firstName || userName(person)}?` : 'How was your trip?'}</Text>
        </View>
      </View>

      <View style={styles.starsRow} accessibilityRole="adjustable" accessibilityLabel="Rating" accessibilityValue={{ min: 0, max: 5, now: stars }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => choose(star)} hitSlop={6} style={styles.starButton}
            accessibilityRole="button" accessibilityLabel={`${star} star${star > 1 ? 's' : ''}, ${STAR_LABELS[star]}`}
            accessibilityState={{ selected: star <= stars }}>
            <MaterialCommunityIcons name={star <= stars ? 'star' : 'star-outline'} size={40}
              color={star <= stars ? COLORS.accent : COLORS.lineStrong} />
          </Pressable>
        ))}
      </View>
      <Text style={[TYPE.captionStrong, styles.starLabel]}>{stars ? STAR_LABELS[stars] : 'Tap a star to rate'}</Text>

      {stars > 0 && <>
        <Text style={[TYPE.overline, styles.section]}>{stars >= 4 ? 'WHAT WENT WELL?' : 'WHAT WENT WRONG?'}</Text>
        <View style={styles.tags}>
          {tagsFor(rateeRole, stars).map((tag) => <Chip key={tag} label={tag} selected={tags.includes(tag)} onPress={() => toggle(tag)} />)}
        </View>
        {safety && <View style={styles.safety}>
          <MaterialCommunityIcons name="shield-alert-outline" size={18} color={COLORS.warning} />
          <Text style={[TYPE.caption, styles.safetyText]}>This will be sent to IndangGO admins as a safety report.</Text>
        </View>}
        <Field label="Comment (optional)" placeholder={stars >= 4 ? 'Anything to add?' : 'Tell us what happened'}
          value={comment} onChangeText={setComment} maxLength={MAX_COMMENT_LENGTH} multiline style={styles.section} />
      </>}

      {error && <Text style={[TYPE.caption, styles.error]}>{error}</Text>}
      <Button label="Submit rating" disabled={!stars} loading={busy} onPress={submit} />
      {onSkip && <Button label="Not now" variant="ghost" size="md" onPress={onSkip} disabled={busy} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.canvas, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  headerText: { flex: 1 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  starButton: { paddingHorizontal: SPACE.xs, paddingTop: SPACE.lg },
  starLabel: { textAlign: 'center', marginTop: SPACE.xs, color: COLORS.inkSecondary },
  section: { marginTop: SPACE.lg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.sm },
  safety: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.md, backgroundColor: COLORS.warningTint },
  safetyText: { flex: 1, color: COLORS.warning },
  error: { color: COLORS.danger, marginBottom: SPACE.sm },
  done: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  doneText: { flex: 1 },
});
