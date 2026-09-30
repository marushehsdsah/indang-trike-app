import { NativeModules, Platform } from 'react-native';
import { getApiBaseUrl } from '../utils/registration';
import { apiRequest } from '../utils/apiClient';

export const API_BASE_URL = getApiBaseUrl({ configuredUrl: process.env.EXPO_PUBLIC_API_URL, scriptUrl: NativeModules.SourceCode?.scriptURL, platform: Platform.OS });
export const requestApi = (path, options = {}) => apiRequest(path, { ...options, baseUrl: API_BASE_URL });
