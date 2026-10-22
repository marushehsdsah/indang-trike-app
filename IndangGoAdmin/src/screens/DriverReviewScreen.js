// =============================================================
// screens/DriverReviewScreen.js
// -------------------------------------------------------------
// One driver's sign-up details, opened from Account Approval or
// from a driver in Accounts, for the admin to compare with the
// TODA's list of registered drivers and decide:
// - Pending: Approve, Terminate or Delete.
// - Approved: Terminate or Delete.
// - Terminated: Unblock (the driver waits for approval again).
// Terminate disables the account and blocks its mobile number and
// email from signing up again; Delete removes the account, so the
// driver can sign up again with corrected details. Both sign the
// driver out at once and cancel any trip they are on. The driver
// is emailed when approved, terminated or deleted, with the
// reason written here, if any.
//
// HOW TO EDIT:
// - The driver comes from useAdminData('drivers/<key>'); each
//   decision goes through the session's act() (session.js).
// - What each decision asks and says lives in DECISIONS below,
//   and which ones a driver gets in ACTIONS.
// =============================================================

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import useAdminData from '../useAdminData';
import formatDate from '../formatDate';
import { useAdminSession } from '../session';
import StatusBadge from '../components/StatusBadge';
import LoadState, { RefreshError } from '../components/LoadState';

const DECISIONS = {
  approve: {
    label: 'Approve', icon: 'checkmark-circle-outline', tone: 'primary', confirm: 'Approve',
    title: 'Approve this driver?',
    message: (name) => `${name} can go online and get bookings right away.`,
    done: 'Driver approved',
  },
  terminate: {
    label: 'Terminate', icon: 'ban-outline', tone: 'danger', confirm: 'Terminate', destructive: true,
    title: 'Terminate this account?',
    message: (name) => `${name} is signed out at once and any trip they are on is cancelled. Their mobile number and email can’t sign up again unless you unblock them.`,
    done: 'Account terminated',
  },
  delete: {
    label: 'Delete', icon: 'trash-outline', tone: 'quiet', confirm: 'Delete', destructive: true,
    title: 'Delete this account?',
    message: (name) => `${name}’s account is removed for good and they are signed out at once. They can sign up again with corrected details.`,
    done: 'Account deleted',
  },
  unblock: {
    label: 'Unblock', icon: 'lock-open-outline', tone: 'primary', confirm: 'Unblock',
    title: 'Unblock this driver?',
    message: (name) => `${name}’s mobile number and email are freed, and the account goes back to Pending for you to check again.`,
    done: 'Driver unblocked',
  },
};
// The decisions open to a driver, by their approval.
const ACTIONS = { Pending: ['approve', 'terminate', 'delete'], Approved: ['terminate', 'delete'], Terminated: ['unblock'] };

export default function DriverReviewScreen({ navigation, route }) {
  const { key } = route.params;
  const { act } = useAdminSession();
  const { data, loading, refreshing, error, reload, refresh } = useAdminData(`drivers/${key}`);
  const driver = data?.driver;
  const [reason, setReason] = useState('');
  // The decision being sent, if any; the buttons wait for it.
  const [working, setWorking] = useState(null);

  const actions = driver ? ACTIONS[driver.approval] || [] : [];
  const removable = actions.includes('terminate');

  const decide = (decision) => {
    const text = DECISIONS[decision];
    Alert.alert(text.title, text.message(driver.name), [
      { text: 'Cancel', style: 'cancel' },
      { text: text.confirm, style: text.destructive ? 'destructive' : 'default', onPress: () => send(decision) },
    ]);
  };

  const send = async (decision) => {
    const text = DECISIONS[decision];
    setWorking(decision);
    try {
      const body = decision === 'terminate' || decision === 'delete' ? { reason: reason.trim() } : {};
      const result = await act(`drivers/${key}/${decision}`, body);
      const message = decision === 'unblock'
        ? `${driver.name} is back in Pending. Approve them once their details check out.`
        : result.emailed ? `${driver.name} was emailed about it.` : `The email to ${driver.name} couldn’t be sent, so let them know yourself.`;
      Alert.alert(text.done, message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (failure) {
      // Another admin may have decided first: show the driver as they are now.
      Alert.alert('Couldn’t update the driver', failure.message || 'Try again.');
      reload();
    } finally {
      setWorking(null);
    }
  };

  const details = driver ? [
    { icon: 'call-outline', label: 'Mobile number', value: driver.id },
    { icon: 'mail-outline', label: 'Email', value: driver.email || '—' },
    { icon: 'people-outline', label: 'TODA', value: driver.toda || '—' },
    { icon: 'car-outline', label: 'Plate', value: driver.plate || '—' },
    { icon: 'person-outline', label: 'Capacity', value: driver.capacity ? `${driver.capacity} passenger${driver.capacity === 1 ? '' : 's'}` : '—' },
    { icon: 'calendar-outline', label: 'Signed up', value: driver.joined ? formatDate(driver.joined) : '—' },
    { icon: 'phone-portrait-outline', label: 'App', value: driver.status },
    ...(driver.approval === 'Approved' && driver.approvedAt ? [{ icon: 'checkmark-circle-outline', label: 'Approved', value: formatDate(driver.approvedAt) }] : []),
    ...(driver.approval === 'Terminated' && driver.terminatedAt ? [{ icon: 'ban-outline', label: 'Terminated', value: formatDate(driver.terminatedAt) }] : []),
    ...(driver.approval === 'Terminated' ? [{ icon: 'document-text-outline', label: 'Reason', value: driver.terminationReason || 'None given' }] : []),
  ] : [];

  return (
    <View style={styles.screen}>
      {/* ---- Top bar: back arrow + title ---- */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.brandGreenDark} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Driver Review</Text>
      </View>

      {!driver ? <LoadState loading={loading} error={error} onRetry={reload} /> : (
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.brandGreen]} />}
      >
        {error && <RefreshError message={error} />}

        {/* ---- Who ---- */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={30} color={colors.textOnDark} />
          </View>
          <Text style={styles.name}>{driver.name}</Text>
          {/* The badge keeps to its own width; the row centres it. */}
          <View style={styles.badgeRow}>
            <StatusBadge label={driver.approval} />
          </View>
        </View>

        {driver.approval === 'Pending' && (
          <View style={styles.notice}>
            <Ionicons name="list-outline" size={18} color={colors.brandGreenDark} />
            <Text style={styles.noticeText}>
              Compare these details with {driver.toda || 'the TODA'}’s list of registered drivers. Until you approve, this driver can’t go online or get bookings.
            </Text>
          </View>
        )}

        {/* ---- What they signed up with ---- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign-up Details</Text>
          {details.map((row) => (
            <View key={row.label} style={styles.detailRow}>
              <Ionicons name={row.icon} size={18} color={colors.textSecondary} />
              <Text style={styles.detailLabel}>{row.label}</Text>
              <Text style={styles.detailValue} selectable>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* ---- Optional reason, emailed if the account is terminated or deleted ---- */}
        {removable && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reason (optional)</Text>
            <Text style={styles.hint}>Included in the email if you terminate or delete this account.</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="e.g. Plate not on the TODA list"
              placeholderTextColor={colors.placeholder}
              value={reason}
              onChangeText={setReason}
              maxLength={200}
              multiline
              editable={!working}
            />
          </View>
        )}

        {/* ---- Decisions ---- */}
        <View style={styles.actions}>
          {actions.map((decision) => {
            const text = DECISIONS[decision];
            return (
              <TouchableOpacity
                key={decision}
                style={[styles.actionButton, styles[`${text.tone}Button`], working && styles.disabled]}
                onPress={() => decide(decision)}
                disabled={Boolean(working)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(working), busy: working === decision }}
              >
                {working === decision
                  ? <ActivityIndicator size="small" color={text.tone === 'primary' ? colors.textOnDark : colors.statusCancelled} />
                  : <Ionicons name={text.icon} size={20} color={text.tone === 'primary' ? colors.textOnDark : colors.statusCancelled} />}
                <Text style={[styles.actionText, styles[`${text.tone}Text`]]}>{text.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.brandGreenDark,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  identityCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    gap: 8,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.brandYellowSoft,
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.brandGreenDark,
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
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'right',
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  reasonInput: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  actions: {
    gap: 10,
    marginTop: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 14,
  },
  primaryButton: {
    backgroundColor: colors.brandGreenDark,
  },
  dangerButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.statusCancelled,
  },
  quietButton: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.6,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryText: {
    color: colors.textOnDark,
  },
  dangerText: {
    color: colors.statusCancelled,
  },
  quietText: {
    color: colors.statusCancelled,
  },
});
