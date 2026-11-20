// =============================================================
// components/DriverDocuments.js
// -------------------------------------------------------------
// The photos a driver signed up with (driver's license,
// registration OR/CR, franchise MTOP), on Driver Review, for the
// admin to check against the TODA's records before approving.
// Each tile shimmers (components/Skeleton.js) until its photo
// arrives. Tapping one opens it full screen; Zoom shows it
// larger, to pan around and read each name and number.
//
// HOW TO EDIT:
// - documents comes with the driver (GET /api/admin/drivers/<key>):
//   [{ kind, label, uploadedAt }], uploadedAt null when missing.
// - Each image loads through the session's imageSource()
//   (session.js); the mock data has none, so no preview shows.
// =============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import { useAdminSession } from '../session';
import { Bone, Skeleton } from './Skeleton';

// How much wider than the screen a zoomed photo is drawn.
const ZOOM = 2.5;

export default function DriverDocuments({ driverKey, documents }) {
  const { imageSource } = useAdminSession();
  // The photo open full screen, and the ones that would not load (tap to retry).
  const [open, setOpen] = useState(null);
  const [failed, setFailed] = useState({});
  // The photos that have arrived; until then a tile shimmers.
  const [loaded, setLoaded] = useState({});
  // Changes only return a new object when they change something, so the
  // screen is not redrawn (and its images reloaded) for nothing.
  const mark = (setter, kind, value) => setter((current) => (current[kind] === value ? current : { ...current, [kind]: value }));
  // One source per photo, kept between redraws so an image is not loaded again.
  const sources = useMemo(() => Object.fromEntries(documents.map((document) => [document.kind,
    imageSource?.(`drivers/${driverKey}/documents/${document.kind}`) || null])), [documents, driverKey, imageSource]);
  const sent = documents.filter((document) => document.uploadedAt);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Documents</Text>
      {!sent.length ? (
        <Text style={styles.hint}>No document photos on file. This driver signed up before photos were required.</Text>
      ) : (
        <>
          <Text style={styles.hint}>Tap a photo to see it full size and check every name and number.</Text>
          <View style={styles.row}>
            {documents.map((document) => {
              const image = document.uploadedAt ? sources[document.kind] : null, broken = failed[document.kind];
              const note = !document.uploadedAt ? 'Missing' : !image ? 'No preview' : broken ? 'Couldn’t load. Tap to retry' : null;
              return (
                <TouchableOpacity
                  key={document.kind}
                  style={styles.tile}
                  disabled={!image}
                  onPress={() => (broken ? mark(setFailed, document.kind, false) : setOpen(document))}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={broken ? `Retry ${document.label}` : `Open ${document.label}`}
                  accessibilityState={{ disabled: !image }}
                >
                  <View style={[styles.thumb, !document.uploadedAt && styles.thumbMissing]}>
                    {image && !broken
                      ? <>
                          <Image source={image} style={styles.thumbImage} resizeMode="cover"
                            onLoad={() => mark(setLoaded, document.kind, true)}
                            onError={() => { mark(setFailed, document.kind, true); mark(setLoaded, document.kind, false); }} />
                          {/* Shimmers over the tile until the photo has downloaded. */}
                          {!loaded[document.kind] && <Skeleton style={styles.thumbImage}><Bone width="100%" height="100%" radius={0} /></Skeleton>}
                        </>
                      : <>
                          <Ionicons name={document.uploadedAt ? 'image-outline' : 'alert-circle-outline'} size={22}
                            color={document.uploadedAt ? colors.textSecondary : colors.statusCancelled} />
                          <Text style={[styles.thumbNote, !document.uploadedAt && styles.missingText]}>{note}</Text>
                        </>}
                  </View>
                  <Text style={styles.tileLabel}>{document.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
      <DocumentViewer document={open} source={open ? sources[open.kind] : null} onClose={() => setOpen(null)} />
    </View>
  );
}

// One photo full screen: fit to the screen, or zoomed in to pan around.
function DocumentViewer({ document, source, onClose }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);
  // The photo's width over its height, once it has loaded.
  const [aspect, setAspect] = useState(4 / 3);
  useEffect(() => { setZoomed(false); }, [document?.kind]);
  const measure = (event) => {
    const { width: imageWidth, height: imageHeight } = event?.nativeEvent?.source || {};
    if (imageWidth && imageHeight) setAspect(imageWidth / imageHeight);
  };

  return (
    <Modal visible={Boolean(document && source)} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.viewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.viewerBar}>
          <Text style={styles.viewerTitle} numberOfLines={1}>{document?.label}</Text>
          <TouchableOpacity onPress={() => setZoomed((value) => !value)} hitSlop={HIT_SLOP}
            accessibilityRole="button" accessibilityLabel={zoomed ? 'Fit to screen' : 'Zoom in'}>
            <Ionicons name={zoomed ? 'contract-outline' : 'expand-outline'} size={24} color={colors.textOnDark} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.textOnDark} />
          </TouchableOpacity>
        </View>
        {source && (zoomed ? (
          <ScrollView style={styles.flex} contentContainerStyle={styles.zoomContent}>
            <ScrollView horizontal>
              <Image source={source} style={{ width: width * ZOOM, height: (width * ZOOM) / aspect }} resizeMode="contain" />
            </ScrollView>
          </ScrollView>
        ) : (
          <Image source={source} style={styles.flex} resizeMode="contain" onLoad={measure} />
        ))}
      </View>
    </Modal>
  );
}

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
  },
  thumb: {
    aspectRatio: 4 / 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  thumbMissing: {
    borderColor: colors.statusCancelled,
    borderStyle: 'dashed',
  },
  thumbImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  thumbNote: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  missingText: {
    color: colors.statusCancelled,
    fontWeight: '700',
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 6,
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  viewerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textOnDark,
  },
  zoomContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
