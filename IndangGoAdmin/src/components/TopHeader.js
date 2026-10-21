// =============================================================
// components/TopHeader.js
// -------------------------------------------------------------
// The thin top bar shown on Dashboard / Accounts / Trips:
// [ hamburger  Admin                            (avatar) ]
//
// HOW TO EDIT:
// - "title" prop changes the word next to the menu icon.
// - The avatar opens the admin's Profile screen (a stack route in
//   App.js). The hamburger is still non-functional (no drawer wired
//   up yet) — see its onPress comment below.
// =============================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

export default function TopHeader({ title = 'Admin' }) {
  // TopHeader sits inside the tab screens, which aren't stack routes
  // themselves, so it reaches the stack through the hook.
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <TouchableOpacity
          // TODO: wire this up to open a side drawer/menu later
          onPress={() => {}}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={24} color={colors.brandGreenDark} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
      </View>

      <TouchableOpacity
        onPress={() => navigation.navigate('Profile')}
        style={styles.avatar}
        accessibilityRole="button"
        accessibilityLabel="Profile"
  >
        <Ionicons name="person" size={18} color={colors.textOnDark} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.brandGreenDark,
    marginLeft: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
