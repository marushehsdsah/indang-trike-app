import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PassengerScreen from '../screens/Passenger/PassengerScreen';
import RideCancel from '../screens/RideCancel';
import ActiveRideScreen from '../screens/Passenger/P-RideScreen';
import HistoryScreen from '../screens/Passenger/P-HistoryScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Passenger" component={PassengerScreen} />
      <Stack.Screen name="RideCancel" component={RideCancel} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} /> 
      <Stack.Screen name="History" component={HistoryScreen} />
      {/* You can add BookingScreen, DriverScreen, and HistoryScreen here when you create them! */}
    </Stack.Navigator>
  );
} 