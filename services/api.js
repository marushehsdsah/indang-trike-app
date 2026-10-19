import { NativeModules, Platform } from 'react-native';
import { fetch } from 'expo/fetch';
import { getApiBaseUrl } from '../utils/registration';
import { apiRequest } from '../utils/apiClient';

export const API_BASE_URL = getApiBaseUrl({ configuredUrl: process.env.EXPO_PUBLIC_API_URL, scriptUrl: NativeModules.SourceCode?.scriptURL, platform: Platform.OS });
// Expo's native fetch, not React Native's XMLHttpRequest one: on Android the
// latter can deliver a response's events out of order, and its fetch polyfill
// then throws outside any promise ("status provided (0)"), which closes a
// release build. Location updates every few seconds made that a regular crash.
export const requestApi = (path, options = {}) => apiRequest(path, { fetchImpl: fetch, ...options, baseUrl: API_BASE_URL });
