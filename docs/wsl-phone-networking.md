# Running on a phone from WSL

The development build loads the app from the address in the QR code, and the app sends API
requests to port 3000 on that same host (`utils/registration.js`). Under WSL2's
default NAT networking that address is WSL-internal (`172.x.x.x`), which only
the Windows PC can reach. A phone then fails with
`java.io.IOException: Failed to download remote update`. The Windows Android
emulator is unaffected.

`./start.sh` detects this and warns you. To fix it, enable mirrored networking,
which puts WSL on the PC's own LAN address (Windows 11 22H2 or later).

1. Create `%USERPROFILE%\.wslconfig` (on Windows) containing:

   ```ini
   [wsl2]
   networkingMode=mirrored
   ```

2. In an **administrator** PowerShell, allow Metro (8081) and the backend (3000)
   through the Hyper-V firewall that guards WSL, then restart WSL:

   ```powershell
   New-NetFirewallHyperVRule -Name "IndangGO-dev" -DisplayName "IndangGO Metro + backend" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 8081,3000
   wsl --shutdown
   ```

3. Reopen WSL and run `./start.sh`. It logs the LAN address phones will use and
   the QR code shows `exp://192.168.x.x:8081`. If it picked the wrong adapter
   (e.g. a VPN), override it: `REACT_NATIVE_PACKAGER_HOSTNAME=192.168.x.x ./start.sh`.

## Still failing?

- Open `http://<that address>:8081` in the phone's browser. If it doesn't load,
  the problem is the network, not Expo.
- The phone and PC must be on the same Wi-Fi. Guest networks and routers with
  client (AP) isolation block device-to-device traffic; a phone hotspot is a
  quick workaround.
- `./start.sh --tunnel` exposes Metro over the internet but not the backend, so
  login and registration fail unless `EXPO_PUBLIC_API_URL` points at a backend
  the phone can reach. Use it only for UI work.
- Running `start.bat` from Windows also works, at the cost of reinstalling
  `node_modules` for Windows.
