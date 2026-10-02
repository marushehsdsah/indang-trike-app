import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { COLORS } from '../theme';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import PassengerScreen from '../screens/PassengerScreen';
import SearchingScreen from '../screens/SearchingScreen';
import ActiveRideScreen from '../screens/ActiveRideScreen'; 
import NavigationScreen from '../screens/NavigationScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import DriverScreen from '../screens/DriverScreen';
import { useApp } from '../context/AppContext';
import { ACTIVE_STATUSES } from '../utils/rideState';
import { preloadRoadGraph } from '../data/roadNetwork';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, loading, ride } = useApp();
  // Loads the offline road graph once the signed-in app is idle, for riders
  // and drivers alike, so no route, reroute, or live trip waits for it.
  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn) return undefined;
    const handle = requestIdleCallback(preloadRoadGraph);
    return () => cancelIdleCallback(handle);
  }, [signedIn]);
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface }}><ActivityIndicator size="large" color={COLORS.brand} /></View>;
  const driver = user?.role === 'driver';
  const initial = !user?.profileComplete ? 'Profile' : ride && ACTIVE_STATUSES.includes(ride.status) ? (ride.status === 'searching' ? 'Searching' : 'ActiveRide') : driver ? 'Driver' : 'Passenger';
  return (
    <Stack.Navigator key={user?.id || 'guest'} initialRouteName={user ? initial : 'Splash'} screenOptions={{ headerShown: false }}>
      {!user ? <>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      </> : <>
      {driver ? <Stack.Screen name="Driver" component={DriverScreen} /> : <>
      <Stack.Screen name="Passenger" component={PassengerScreen} />
      <Stack.Screen name="Searching" component={SearchingScreen} />
      </>}
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} /> 
      <Stack.Screen name="Navigation" component={NavigationScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      </>}
    </Stack.Navigator>
  );
}
