import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './navigation/AppNavigator';
import { AppProvider } from './context/AppContext';
import OfflineMapSync from './components/OfflineMapSync';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider><AppProvider><OfflineMapSync /><NavigationContainer>
      <AppNavigator />
    </NavigationContainer></AppProvider></SafeAreaProvider>
  );
}
