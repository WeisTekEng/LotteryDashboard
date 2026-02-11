
# Auto-Tune Reference: Miner API Responses

This document contains sample JSON responses for the `/api/system/info` endpoint of the NerdQAxe (ESP-Miner) and Gamma 601 (AxeOS) devices.

## 1. NerdQAxe++ (ESP-Miner Firmware)

**Key Characteristics:**
- **Missing:** `power_fault` (does not exist).
- **Missing:** `errorPercentage` (at root level).
- **Fault Detection:** Must use `lastResetReason` or inferred state (Zero Hashrate + High Errors).
- **Hashrate:** Uses `hashRate` (camelCase).
- **Identification:** `deviceModel` contains "NerdQAxe", `boardVersion` contains "Rev 6".

```json
{
  "asicCount": 1,
  "smallCoreCount": 0,
  "deviceModel": "NerdQAxe Rev 6.1 (NerdMiner)",
  "hostip": "********",
  "macAddr": "********",
  "wifiRSSI": -55,
  "power": 12.5,
  "maxPower": 25.0,
  "minPower": 5.0,
  "maxVoltage": 1400,
  "minVoltage": 1100,
  "current": 1045,
  "currentA": 1.045,
  "minCurrentA": 0.5,
  "maxCurrentA": 2.0,
  "temp": 45.5,
  "vrTemp": 50.2,
  "vrTempInt": 50,
  "hashRateTimestamp": 1700000000,
  "hashRate": 550.0,
  "hashRate_1m": 548.0,
  "hashRate_10m": 545.0,
  "hashRate_1h": 540.0,
  "hashRate_1d": 0.0,
  "coreVoltage": 1200,
  "defaultCoreVoltage": 1100,
  "coreVoltageActual": 1198,
  "fanspeed": 80,
  "manualFanSpeed": 0,
  "fanrpm": 4500,
  "fanrpm2": 0,
  "fanCount": 1,
  "lastpingrtt": 15,
  "recentpingloss": 0,
  "shutdown": false,
  "duplicateHWNonces": 0,
  "stratum": {
    "url": "stratum+tcp://pool.ckpool.org:3333",
    "user": "********",
    "difficulty": 1024
  },
  "poolDifficulty": 1024,
  "foundBlocks": 0,
  "totalFoundBlocks": 0,
  "sharesAccepted": 1500,
  "sharesRejected": 5,
  "bestDiff": 500000,
  "bestSessionDiff": 120000,
  "asicTemps": [45.5],
  "pidTargetTemp": 50,
  "pidP": 0.5,
  "pidI": 0.02,
  "pidD": 0.0,
  "hostname": "nerdqaxe-rev6",
  "ssid": "MyWiFi",
  "stratumURL": "stratum+tcp://pool.ckpool.org:3333",
  "stratumPort": 3333,
  "stratumUser": "********",
  "stratumEnonceSubscribe": true,
  "stratumTLS": false,
  "fallbackStratumURL": "",
  "fallbackStratumPort": 3333,
  "fallbackStratumUser": "",
  "fallbackStratumEnonceSubscribe": false,
  "fallbackStratumTLS": false,
  "voltage": 12200, 
  "frequency": 600,
  "defaultFrequency": 500,
  "jobInterval": 50,
  "stratumDifficulty": 0,
  "overheat_temp": 80,
  "flipscreen": 0,
  "invertscreen": 0,
  "autoscreenoff": 0,
  "invertfanpolarity": 0,
  "autofanspeed": 1,
  "stratum_keep": 1,
  "otp": false,
  "ASICModel": "BM1370",
  "uptimeSeconds": 3600,
  "lastResetReason": "Power On", 
  "wifiStatus": "connected",
  "freeHeap": 200000,
  "freeHeapInt": 150000,
  "version": "1.6.3",
  "runningPartition": "app",
  "defaultTheme": 0,
  "hashrateMonitor": {
        "asics": [
            {
                "total": 550.0,
                "domains": [550.0],
                "errorCount": 0
            }
        ]
  }
}
```

## 2. Gamma 601 (Official AxeOS Firmware)

**Key Characteristics:**
- **Present:** `power_fault` (only if fault exists).
- **Present:** `errorPercentage`.
- **Fault Detection:** Checks `power_fault` string for "Fault".
- **Hashrate:** Uses `hashRate` (camelCase) in recent versions.
- **Identification:** `boardVersion` is "601" (Gamma) or "602" (GT).

```json
{
  "power": 15.2,
  "voltage": 5046.875,
  "current": 3011.0,
  "temp": 48.2,
  "temp2": 0.0,
  "vrTemp": 52.1,
  "maxPower": 20.0,
  "nominalVoltage": 5000,
  "hashRate": 605.5,
  "hashRate_1m": 602.1,
  "hashRate_10m": 600.5,
  "hashRate_1h": 598.0,
  "expectedHashrate": 600.0,
  "errorPercentage": 0.05,
  "bestDiff": 800000,
  "bestSessionDiff": 250000,
  "poolDifficulty": 2048,
  "isUsingFallbackStratum": 0,
  "poolConnectionInfo": "Connected",
  "isPSRAMAvailable": 1,
  "freeHeap": 180000,
  "freeHeapInternal": 120000,
  "freeHeapSpiram": 60000,
  "coreVoltage": 1350,
  "coreVoltageActual": 1348,
  "frequency": 625.0,
  "ssid": "********",
  "macAddr": "********",
  "hostname": "bitaxe-gamma-601",
  "ipv4": "********",
  "ipv6": "",
  "wifiStatus": "connected",
  "wifiRSSI": -60,
  "apEnabled": 0,
  "sharesAccepted": 2500,
  "sharesRejected": 2,
  "sharesRejectedReasons": [],
  "uptimeSeconds": 7200,
  "smallCoreCount": 0,
  "ASICModel": "Bitaxe Gamma (BM1370)",
  "stratumURL": "stratum+tcp://public-pool.io:21496",
  "stratumPort": 21496,
  "stratumUser": "bc1qxy...worker1",
  "stratumSuggestedDifficulty": 0,
  "stratumExtranonceSubscribe": 1,
  "stratumTLS": 0,
  "stratumCert": "",
  "fallbackStratumURL": "",
  "fallbackStratumPort": 3333,
  "fallbackStratumUser": "",
  "fallbackStratumSuggestedDifficulty": 0,
  "fallbackStratumExtranonceSubscribe": 0,
  "fallbackStratumTLS": 0,
  "fallbackStratumCert": "",
  "responseTime": 25.0,
  "version": "2.2.0",
  "axeOSVersion": "2.2.0",
  "idfVersion": "v5.0.1",
  "boardVersion": "601",
  "resetReason": "Power On",
  "runningPartition": "ota_0",
  "overheat_mode": 1,
  "overclockEnabled": 1,
  "display": "ssd1306",
  "rotation": 0,
  "invertscreen": 0,
  "displayTimeout": 300,
  "autofanspeed": 1,
  "fanspeed": 75.0,
  "manualFanSpeed": 0,
  "minFanSpeed": 20,
  "temptarget": 50,
  "fanrpm": 5200,
  "fan2rpm": 0,
  "statsFrequency": 5000,
  "blockFound": 0,
  "power_fault": "", 
  "blockHeight": 850000,
  "height": 850000,
  "scriptsig": "",
  "networkDifficulty": 88000000000000,
  "coinbaseOutputs": [],
  "coinbaseValueTotalSatoshis": 312500000,
  "coinbaseValueUserSatoshis": 0,
  "hashrateMonitor": {
        "asics": [
            {
                "total": 605.5,
                "domains": [605.5],
                "errorCount": 0
            }
        ]
  }
}
```
