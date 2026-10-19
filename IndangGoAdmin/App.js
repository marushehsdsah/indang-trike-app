// =============================================================
// App.js  (root component)
// -------------------------------------------------------------
// Uses @react-navigation/native-stack as the app-level navigator:
//
//   Login  ->  Welcome  ->  Main (bottom-tab screens)
//                             └─>  Profile (from the avatar in TopHeader)
//
// Each screen calls navigation.replace(...) to move forward
// (not navigation.navigate) so the user can't swipe/back-button
// their way back to Login or the Welcome splash once they've
// passed them — that matches how a real auth flow behaves.
//
// HOW TO EDIT:
// - To add a new top-level screen (e.g. a Settings screen reached
//   from Main), add a <Stack.Screen> below and navigate to it with
//   navigation.navigate('ScreenName') from wherever you need it.
// - headerShown is set to false because every screen already
//   draws its own header (TopHeader) or has none (Login/Welcome).
// =============================================================

import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import LoginScreen from './src/screens/LoginScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import MainScreen from './src/screens/MainScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import colors from './src/theme/colors';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Main" component={MainScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
