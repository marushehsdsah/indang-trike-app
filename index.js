import { registerRootComponent } from 'expo';
import { LogManager } from '@maplibre/maplibre-react-native';
import { handleMapLog } from './utils/mapLogs';

import App from './App';

// Base-map tile download failures are retried by the map; see utils/mapLogs.js.
LogManager.onLog(handleMapLog);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
