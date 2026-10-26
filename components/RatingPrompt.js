import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from './ui/Button';
import Field from './ui/Field';
import { Avatar, Chip } from './ui/Surfaces';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { selectionFeedback, successFeedback, warningFeedback } from '../utils/feedback';
import { MAX_COMMENT_LENGTH, SAFETY_TAGS, tagsFor } from '../utils/rating';
import { userName } from '../utils/rideState';

// A tag is sent and stored in English (utils/rating.js); this is its
// translation key, e.g. "Safe driving" -> rating.tag.SafeDriving.
export const ratingTagKey = (tag) => `rating.tag.${tag.replace(/[^A-Za-z]/g, '')}`;

export function Stars({ value, size = 18, style }) {
  const { t } = useI18n();
  return (
    <View style={[styles.starsRow, style]} accessibilityLabel={t('rating.starsA11y', { count: value })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <MaterialCommunityIcons key={star} name={star <= value ? 'star' : 'star-outline'} size={size}
          color={star <= value ? COLORS.accent : COLORS.lineStrong} />
      ))}
    </View>
  );
}

// A person's average, e.g. "★ 4.8 (12)", or "New" before their first rating.
export function RatingBadge({ rating, style }) {
  const { t } = useI18n();
  const rated = rating?.average !== null && rating?.average !== undefined;
  return (
    <View style={[styles.badge, style]}
      accessibilityLabel={rated ? t('rating.badgeA11y', { average: rating.average.toFixed(1), count: rating.count }) : t('rating.none')}>
      <MaterialCommunityIcons name="star" size={14} color={COLORS.accentDark} />
      <Text style={[TYPE.captionStrong, styles.badgeText]}>{rated ? `${rating.average.toFixed(1)} (${rating.count})` : t('rating.new')}</Text>
    </View>
  );
}

// After a ride with a driver ends, completed or cancelled by anyone, the
// passenger rates the driver (ride.ratable). Once rated it shows the given
// stars. onSkip hides it for now; the ride can still be rated from History.
export default function RatingPrompt({ ride, asDriver, onSkip, onRated, style }) {
  const { rateRide } = useApp();
  const { t } = useI18n();
  const person = asDriver ? ride.passenger : ride.driver;
  const rateeRole = asDriver ? 'passenger' : 'driver';
  // A cancelled trip asks about the person rather than the trip.
  const name = person ? person.firstName || userName(person) : null;
  const question = name ? t(ride.status === 'cancelled' ? 'rating.howWasCancelled' : 'rating.howWasWith', { name }) : t('rating.howWas');
  const [stars, setStars] = useState(0), [tags, setTags] = useState([]), [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);

  if (ride.myRating) {
    return (
      <View style={[styles.card, styles.done, style]}>
        <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.brand} />
        <Text style={[TYPE.captionStrong, styles.doneText]}>
          {t('rating.youRated', { name: person ? userName(person) : t(`rating.your.${rateeRole}`) })}
        </Text>
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
          <Text style={TYPE.subheading}>{t(`rating.title.${rateeRole}`)}</Text>
          <Text style={TYPE.caption}>{question}</Text>
        </View>
      </View>

      <View style={styles.starsRow} accessibilityRole="adjustable" accessibilityLabel={t('rating.a11y')} accessibilityValue={{ min: 0, max: 5, now: stars }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => choose(star)} hitSlop={6} style={styles.starButton}
            accessibilityRole="button" accessibilityLabel={t('rating.starA11y', { count: star, label: t(`rating.star.${star}`) })}
            accessibilityState={{ selected: star <= stars }}>
            <MaterialCommunityIcons name={star <= stars ? 'star' : 'star-outline'} size={40}
              color={star <= stars ? COLORS.accent : COLORS.lineStrong} />
          </Pressable>
        ))}
      </View>
      <Text style={[TYPE.captionStrong, styles.starLabel]}>{stars ? t(`rating.star.${stars}`) : t('rating.tapStar')}</Text>

      {stars > 0 && <>
        <Text style={[TYPE.label, styles.section]}>{t(stars >= 4 ? 'rating.wentWell' : 'rating.wentWrong')}</Text>
        <View style={styles.tags}>
          {tagsFor(rateeRole, stars).map((tag) => <Chip key={tag} label={t(ratingTagKey(tag))} selected={tags.includes(tag)} onPress={() => toggle(tag)} />)}
        </View>
        {safety && <View style={styles.safety}>
          <MaterialCommunityIcons name="shield-alert-outline" size={18} color={COLORS.warning} />
          <Text style={[TYPE.caption, styles.safetyText]}>{t('rating.safetyNote')}</Text>
        </View>}
        <Field label={t('rating.comment')} placeholder={t(stars >= 4 ? 'rating.commentPraise' : 'rating.commentConcern')}
          value={comment} onChangeText={setComment} maxLength={MAX_COMMENT_LENGTH} multiline style={styles.section} />
      </>}

      {error && <Text style={[TYPE.caption, styles.error]}>{error}</Text>}
      <Button label={t('rating.submit')} disabled={!stars} loading={busy} onPress={submit} />
      {onSkip && <Button label={t('rating.notNow')} variant="text" size="md" onPress={onSkip} disabled={busy} />}
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
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: SPACE.sm, paddingVertical: 2, borderRadius: 999, backgroundColor: COLORS.accentTint, alignSelf: 'flex-start' },
  badgeText: { color: COLORS.accentDark },
});
