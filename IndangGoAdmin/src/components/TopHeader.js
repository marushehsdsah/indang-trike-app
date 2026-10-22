// =============================================================
// components/TopHeader.js
// -------------------------------------------------------------
// The thin top bar shown on Dashboard / Accounts / Trips and on
// Account Approval:
// [ hamburger  Admin                            (avatar) ]
//
// HOW TO EDIT:
// - "title" prop changes the word next to the menu icon.
// - "section" prop says which menu item is the current one:
//   'dashboard' (the Dashboard / Accounts / Trips tabs) or
//   'approval' (Account Approval).
// - The hamburger opens a menu (MENU_ITEMS below): Dashboard
//   returns to the Dashboard tab, Account Approval opens the
//   drivers waiting for approval. Both are stack routes in
//   App.js and ../navigation/AdminNavigator.js.
// - The avatar opens the admin's Profile screen.
// =============================================================

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline' },
  { key: 'approval', label: 'Account Approval', icon: 'person-add-outline' },
];

export default function TopHeader({ title = 'Admin', section = 'dashboard' }) {
  // TopHeader sits inside the tab screens, which aren't stack routes
  // themselves, so it reaches the stack (and the route it is on,
  // Main or AccountApproval) through the hooks.
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const choose = (key) => {
    setMenuOpen(false);
    if (key === 'approval') {
      if (route.name !== 'AccountApproval') navigation.navigate('AccountApproval');
      return;
    }
    // Dashboard: the Dashboard tab of Main, even from another tab. `at` makes
    // every choice count, even the same one twice (MainScreen.js).
    const params = { tab: 'dashboard', at: Date.now() };
    if (route.name === 'Main') navigation.setParams(params);
    else navigation.popTo('Main', params);
  };

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          accessibilityState={{ expanded: menuOpen }}
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

      {/* ---- The menu: a card under the hamburger over a dimmed screen;
          a tap outside it, or Android's back button, closes it. ---- */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu">
          <Pressable style={[styles.menu, { marginTop: insets.top + 54 }]} accessibilityRole="menu" onPress={() => {}}>
            {MENU_ITEMS.map((item) => {
              const isCurrent = item.key === section;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.menuItem, isCurrent && styles.menuItemCurrent]}
                  onPress={() => choose(item.key)}
                  activeOpacity={0.7}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: isCurrent }}
                >
                  <Ionicons name={item.icon} size={20} color={isCurrent ? colors.navActiveText : colors.textSecondary} />
                  <Text style={[styles.menuLabel, isCurrent && styles.menuLabelCurrent]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 61, 34, 0.25)',
  },
  menu: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    minWidth: 230,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 10,
  },
  menuItemCurrent: {
    backgroundColor: colors.navActiveBg,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuLabelCurrent: {
    color: colors.navActiveText,
    fontWeight: '700',
  },
});
