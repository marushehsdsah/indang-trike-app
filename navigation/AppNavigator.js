import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PassengerScreen from '../screens/PassengerScreen';
import BookingScreen from '../screens/BookingScreen';
import SearchingScreen from '../screens/SearchingScreen';
import ActiveRideScreen from '../screens/ActiveRideScreen'; 
import HistoryScreen from '../screens/HistoryScreen';

// ---- ADMIN ONLY -------------------------------------------------
// AdminNavigator is a nested Stack Navigator that owns the whole
// Indang Go Admin flow (AdminLogin -> AdminWelcome -> AdminMain).
// It's mounted below as a single screen, "AdminApp", so it plugs
// into this existing stack without needing a second
// <NavigationContainer>. See admin/AdminNavigator.js for details.
import AdminNavigator from '../admin/AdminNavigator';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Passenger" component={PassengerScreen} />
      <Stack.Screen name="Booking" component={BookingScreen} />
      <Stack.Screen name="Searching" component={SearchingScreen} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} /> 
      <Stack.Screen name="History" component={HistoryScreen} />
      {/* You can add BookingScreen, DriverScreen, and HistoryScreen here when you create them! */}

      {/* ---- ADMIN ONLY ----------------------------------------
          Entry point into the entire admin app. LoginScreen's
          "Admin Login" link calls navigation.navigate('AdminApp'),
          which lands on AdminNavigator's initial route (AdminLogin). */}
      <Stack.Screen name="AdminApp" component={AdminNavigator} />
    </Stack.Navigator>
  );
} 
