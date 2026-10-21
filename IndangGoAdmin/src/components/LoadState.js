// =============================================================
// components/LoadState.js
// -------------------------------------------------------------
// What a screen shows instead of its data (see useAdminData.js):
// - LoadState: a spinner while the first load runs, or the error
//   with a Retry button when it failed.
// - RefreshError: a one-line note above data that is still shown
//   after a pull-to-refresh failed.
// =============================================================

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

export default function LoadState({ loading, error, onRetry }) {
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.brandGreen} />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={30} color={colors.textSecondary} />
      <Text style={styles.message}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.85} accessibilityRole="button">
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

export function RefreshError({ message }) {
  return (
    <View style={styles.refreshError}>
      <Ionicons name="alert-circle-outline" size={14} color={colors.statusCancelled} />
      <Text style={styles.refreshErrorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.brandGreenDark,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  retryText: {
    color: colors.textOnDark,
    fontSize: 14,
    fontWeight: '700',
  },
  refreshError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  refreshErrorText: {
    flex: 1,
    fontSize: 12,
    color: colors.statusCancelled,
  },
});
