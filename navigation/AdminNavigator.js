import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import LoginScreen from '../IndangGoAdmin/src/screens/LoginScreen';
import WelcomeScreen from '../IndangGoAdmin/src/screens/WelcomeScreen';
import MainScreen from '../IndangGoAdmin/src/screens/MainScreen';
import ProfileScreen from '../IndangGoAdmin/src/screens/ProfileScreen';
import colors from '../IndangGoAdmin/src/theme/colors';

const Stack = createNativeStackNavigator();

// The admin interface (IndangGoAdmin) as one screen of the app: its own
// Login -> Welcome -> Main (+ Profile) stack, as in IndangGoAdmin/App.js. Its screens move
// with navigation.replace('Welcome'/'Main'), which stays inside this stack, so
// their route names cannot clash with the rider app's Login. Back from its
// first screen returns to the rider app's login.
export default function AdminNavigator() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Main" component={MainScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </SafeAreaView>
  );
}
