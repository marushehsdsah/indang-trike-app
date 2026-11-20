import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import OptionSheet from './OptionSheet';
import { Bone, Skeleton } from './ui/Skeleton';
import { pickDocumentPhoto } from './pickPhoto';
import { DRIVER_DOCUMENTS } from '../utils/driverDocuments';
import { useI18n } from '../i18n';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';

const ICONS = { license: 'card-account-details-outline', registration: 'file-document-outline', franchise: 'certificate-outline' };

// The sign-up form's photos of a driver's documents (utils/driverDocuments.js):
// one slot each, taken with the camera or picked from the gallery.
// documents: kind -> { uri, data } (pickDocumentPhoto); onChange(kind, photo
// or null when removed).
export default function DocumentPhotos({ documents, onChange, disabled = false }) {
  const { t } = useI18n();
  // The slot whose camera/gallery menu is open, and the one being processed.
  const [menuFor, setMenuFor] = useState(null);
  const [busy, setBusy] = useState(null);

  const pick = async (kind, camera) => {
    setBusy(kind);
    try {
      const photo = await pickDocumentPhoto({ camera });
      if (photo) onChange(kind, photo);
    } catch (failure) {
      const message = failure.message === 'camera-denied' ? t('profile.cameraDenied')
        : failure.message === 'photo-too-large' ? t('register.documentTooLarge') : failure.message;
      Alert.alert(t('register.documentFailed'), message);
    } finally { setBusy(null); }
  };
  const kind = menuFor;
  const options = kind ? [
    { label: t('profile.takePhoto'), icon: 'camera-outline', onPress: () => pick(kind, true) },
    { label: t('profile.choosePhoto'), icon: 'image-outline', onPress: () => pick(kind, false) },
    ...(documents[kind] ? [{ label: t('register.documentRemove'), icon: 'delete-outline', danger: true, onPress: () => onChange(kind, null) }] : []),
  ] : [];

  return (
    <View style={styles.section}>
      <Text style={TYPE.label}>{t('register.documents')}</Text>
      <Text style={[TYPE.caption, styles.hint]}>{t('register.documentsHint')}</Text>
      {DRIVER_DOCUMENTS.map((item) => {
        const photo = documents[item], label = t(`register.document.${item}`);
        const status = photo ? t('register.documentChange') : t(item === 'franchise' ? 'register.documentAddFranchise' : 'register.documentAdd');
        return (
          <Pressable
            key={item}
            onPress={() => setMenuFor(item)}
            disabled={disabled || Boolean(busy)}
            accessibilityRole="button"
            accessibilityLabel={`${label}. ${status}`}
            accessibilityState={{ disabled: disabled || Boolean(busy), busy: busy === item }}
            style={({ pressed }) => [styles.slot, photo && styles.slotDone, pressed && styles.pressed]}
          >
            {/* While a picked photo is made smaller, its box shimmers. */}
            <View style={styles.thumb}>
              {busy === item ? <Skeleton style={styles.thumbImage}><Bone width="100%" height="100%" radius={0} /></Skeleton>
                : photo ? <Image source={{ uri: photo.uri }} style={styles.thumbImage} resizeMode="cover" />
                : <MaterialCommunityIcons name={ICONS[item]} size={26} color={COLORS.inkMuted} />}
            </View>
            <View style={styles.text}>
              <Text style={TYPE.bodyStrong}>{label}</Text>
              <Text style={TYPE.caption}>{status}</Text>
            </View>
            <MaterialCommunityIcons name={photo ? 'check-circle' : 'camera-plus-outline'} size={24} color={photo ? COLORS.success : COLORS.brand} />
          </Pressable>
        );
      })}
      <OptionSheet visible={Boolean(kind)} title={kind ? t(`register.document.${kind}`) : ''} options={options} onClose={() => setMenuFor(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: SPACE.lg },
  hint: { marginTop: SPACE.xs, marginBottom: SPACE.md },
  slot: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    borderWidth: 1.5, borderColor: COLORS.lineStrong, borderStyle: 'dashed', borderRadius: RADIUS.lg,
    padding: SPACE.md, marginBottom: SPACE.sm, backgroundColor: COLORS.surface,
  },
  slotDone: { borderStyle: 'solid', borderColor: COLORS.line },
  pressed: { opacity: 0.7 },
  thumb: {
    width: 64, height: 48, borderRadius: RADIUS.sm, overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%' },
  text: { flex: 1 },
});
