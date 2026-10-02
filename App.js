import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import AppNavigator from './navigation/AppNavigator';
import { AppProvider } from './context/AppContext';
import { LanguageProvider } from './i18n';
import OfflineMapSync from './components/OfflineMapSync';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from './theme';

export default function App() {
  // The fonts ship inside the app, so this takes a moment, not a download. A
  // failure still opens the app, in the system font.
  const [fontsLoaded, fontError] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: COLORS.surface }} />;
  return (
    <SafeAreaProvider><LanguageProvider><AppProvider><OfflineMapSync /><NavigationContainer>
      <AppNavigator />
    </NavigationContainer></AppProvider></LanguageProvider></SafeAreaProvider>
  );
}
