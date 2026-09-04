import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PassengerScreen from '../screens/Passenger/PassengerScreen';
import BookingScreen from '../screens/Passenger/P-BookingScreen';
import SearchingScreen from '../screens/Passenger/P-SearchingScreen';
import OrdersScreen from '../screens/Passenger/P-OrdersScreen';
import RideCancel from '../screens/RideCancel';
import ActiveRideScreen from '../screens/Passenger/P-RideScreen';
import HistoryScreen from '../screens/Passenger/P-HistoryScreen';
import ProfileScreen from '../screens/Passenger/P-ProfileScreen';
import DriverScreen from '../screens/Driver/DriverScreen';
import DriverActiveRideScreen from '../screens/Driver/D-RideScreen';
import DriverRideCancelScreen from '../screens/Driver/D-RideCancel';
import DriverHistoryScreen from '../screens/Driver/D-HistoryScreen';
import DriverProfileScreen from '../screens/Driver/D-ProfileScreen';
import EditProfileScreen from '../screens/Driver/EditProfileScreen';
import PassengerEditProfileScreen from '../screens/Passenger/PassengerEditProfile';
import MessagingScreen from '../screens/Driver/Messaging';

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
      <Stack.Screen name="RideCancel" component={RideCancel} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Driver" component={DriverScreen} />
      <Stack.Screen name="DriverActiveRide" component={DriverActiveRideScreen} />
      <Stack.Screen name="DriverRideCancel" component={DriverRideCancelScreen} />
      <Stack.Screen name="DriverHistory" component={DriverHistoryScreen} />
      <Stack.Screen name="DriverProfile" component={DriverProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="PassengerEditProfile" component={PassengerEditProfileScreen} />
      <Stack.Screen name="Messaging" component={MessagingScreen} />
    </Stack.Navigator>
  );
} 