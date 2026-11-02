import { Alert } from 'react-native';

// Asks before logging out. A driver is told they will go offline, since
// logging out stops their booking requests (dispatch.js disconnect).
export default function confirmLogOut(t, signOut, driver) {
  Alert.alert(t('profile.logOutTitle'), t(driver ? 'profile.logOutDriver' : 'profile.logOutMessage'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('profile.logOut'), style: 'destructive',
      onPress: () => signOut().catch(() => Alert.alert(t('profile.loggedOutTitle'), t('profile.loggedOutMessage'))) },
  ]);
}
