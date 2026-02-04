# AutoTune PLL Branch - Documentation

## Overview

This enhanced version adds intelligent voltage/frequency management using:
- **PLL Voltage Curves** - Community-tested voltage requirements per frequency
- **Device-Specific Limits** - Different max voltages for 5V vs 12V devices
- **ASIC Model Detection** - Automatic chip identification (BM1397/1366/1368/1370)
- **Linear Interpolation** - Smooth voltage recommendations between curve points

---

## Supported Devices

### **5V Devices** (USB-Powered, Standard Bitaxe)
- **Max Voltage**: 1400mV (safe for 5V rail)
- **Max Frequency**: 700MHz
- **Models**: Bitaxe Ultra, Bitaxe Supra, NerdMiner, etc.

### **12V Devices** (External Power, Higher Performance)
- **Max Voltage**: 1400mV (higher headroom with 12V input)
- **Max Frequency**: 1200MHz
- **Models**: NerdqAxe++, Bitaxe GT 800, custom builds

### **Bitaxe Gamma 601** (5V, Enhanced)
- **Max Voltage**: 1400mV (higher than standard 5V)
- **Max Frequency**: 1200MHz
- **ASIC**: BM1370 (Bitmain's newest chip)
- **Hybrid design with better power delivery**

**Note**: Gamma 901 and 903 variants currently use same limits as 601. These may be adjusted as more data becomes available.

---

## ASIC Chip Support

### **BM1397** (NerdMiner, Early Bitaxe)
```javascript
PLL Curve:
400MHz → 1120mV
450MHz → 1150mV
500MHz → 1160mV
525MHz → 1170mV
550MHz → 1180mV
575MHz → 1200mV
600MHz → 1220mV
625MHz → 1250mV
650MHz → 1275mV
675MHz → 1300mV
700MHz → 1325mV
725MHz → 1350mV
750MHz → 1375mV
775MHz → 1400mV
800MHz → 1425mV
825MHz → 1450mV
850MHz → 1475mV
875MHz → 1500mV
900MHz → 1525mV
925MHz → 1550mV
950MHz → 1575mV
975MHz → 1600mV
1000MHz → 1625mV
```

### **BM1366** (Bitaxe Supra)
```javascript
PLL Curve:
350MHz → 1120mV
400MHz → 1150mV
450MHz → 1160mV
500MHz → 1180mV
550MHz → 1200mV
600MHz → 1230mV
650MHz → 1260mV
700MHz → 1300mV
750MHz → 1340mV
800MHz → 1380mV
850MHz → 1420mV
900MHz → 1460mV
950MHz → 1500mV
1000MHz → 1540mV
1050MHz → 1580mV
1100MHz → 1620mV
1150MHz → 1660mV
1200MHz → 1700mV
```

### **BM1368** (Bitaxe Hex)
```javascript
PLL Curve:
350MHz → 1120mV
400MHz → 1150mV
450MHz → 1160mV
500MHz → 1170mV
600MHz → 1200mV
700MHz → 1240mV
800MHz → 1280mV
900MHz → 1330mV
1000MHz → 1380mV
1100MHz → 1430mV
1200MHz → 1480mV
1300MHz → 1530mV
1400MHz → 1580mV
1500MHz → 1630mV
1600MHz → 1680mV
```

### **BM1370** (Bitaxe Gamma, NerdqAxe++)
**Used in**: Gamma 601, Gamma 901/903, NerdqAxe++

The BM1370 is Bitmain's newest chip (as of 2024) and more efficient than BM1368.

```javascript
PLL Curve:
400MHz → 900mV
450MHz → 967mV
500MHz → 1033mV
550MHz → 1100mV
600MHz → 1122mV
650MHz → 1144mV
700MHz → 1166mV
750MHz → 1188mV
800MHz → 1210mV
850MHz → 1231mV
900MHz → 1253mV
950MHz → 1275mV
1000MHz → 1297mV
1050MHz → 1317mV
1100MHz → 1337mV
1150MHz → 1357mV
1200MHz → 1377mV
1250MHz → 1397mV
1300MHz → 1417mV
```

---

## How It Works

### **1. Device Detection (First Run)**

```javascript
// Automatic detection from miner API data
detectDeviceType(minerData) {
  // Check device name/model
  if (deviceName.includes('nerdqaxe')) return '12V';
  if (deviceName.includes('gamma') && deviceName.includes('601')) return 'Gamma601';
  if (deviceName.includes('gt') || deviceName.includes('800')) return '12V';
  
  // Check input voltage
  if (inputVoltage > 8V) return '12V';
  
  // Default to safe 5V
  return '5V';
}
```

**Logged once per miner:**
```
[AutoTune] 192.168.1.197: Detected ASIC model: BM1368
[AutoTune] 192.168.1.197: Detected device type: Gamma601 (Max: 1500mV / 1200MHz)
```

### **2. PLL Voltage Lookup**

When increasing frequency:
```javascript
// OLD: Blind voltage
newFreq = 900MHz;
newVoltage = currentVoltage; // Hope it's enough!

// NEW: PLL-guided voltage
newFreq = 900MHz;
recommendedV = getRecommendedVoltage(900, 'BM1368', 'Gamma601');
// Returns: 1330mV (from curve) + 25mV (safety) = 1355mV
newVoltage = 1355mV;
```

**With Linear Interpolation:**
```javascript
// Requesting 875MHz (between 800 and 900 in curve)
// 800MHz → 1280mV
// 900MHz → 1330mV
// 875MHz → 1280 + (875-800)/(900-800) * (1330-1280) = 1317.5mV
// Round to 1318mV + 25mV safety = 1343mV
```

### **3. Dynamic Offset Learning**

The engine doesn't just blindly follow the curve—it learns from your specific hardware:

1.  **Observation**: If a miner is running stable at `1232mV` when curve suggests `1238mV`.
2.  **Calculation**: `Offset = 1232 - 1238 = -6mV`.
3.  **Application**: For the next frequency step (e.g., 820MHz), it calculates the curve voltage and **applies the same -6mV offset**.

**Why this matters**:
-   **Efficiency**: Preserves undervolting gains found during the tuning process.
-   **Compensation**: Automatically adjusts for voltage droop (DAC compensation) if the miner consistently reports lower-than-requested voltage.
-   **Correction**: If the offset causes instability, standard stability logic kicks in, bumps the voltage, and the system "learns" a new, safer offset.


### **4. Intelligent Frequency Increases (Adaptive Steps)**

The engine scales its step size based on how far the miner is from its target limits:

-   **Far (>100MHz away)**: **4x Step** (e.g., +40MHz) - "Cruise Mode"
-   **Mid-Range (>50MHz away)**: **2x Step** (e.g., +20MHz) - "Approach Mode"
-   **Close (<50MHz)**: **1x Step** (e.g., +10MHz) - "Precision Mode"

```
Example: Target 1200MHz, Current 600MHz
1. 600 -> 640MHz (+40)
2. 640 -> 680MHz (+40)
...
10. 1100 -> 1120MHz (+20)
11. 1120 -> 1140MHz (+20)
12. 1140 -> 1150MHz (+10)
```

**Result**: Drastically reduced tuning time (minutes instead of hours) while maintaining granular precision where it counts (at the limit).


### **4. Safety Margins**

Each device type has a safety margin added to PLL recommendations:
- **5V devices**: +20mV
- **12V devices**: +30mV (higher margin for more powerful systems)
- **Gamma601**: +25mV

This ensures PLL recommendations are conservative and account for:
- Chip-to-chip variance (silicon lottery)
- Temperature effects
- Voltage droop under load
- Measurement accuracy

---

## Configuration

No configuration changes needed! The system auto-detects everything.

**However**, you can manually override detection by adding fields to your miner data:

```javascript
// In your miner API or metadata
{
  "ASICModel": "BM1370",        // Override auto-detection
  "deviceModel": "NerdqAxe++",  // Helps with device type detection
  "inputVoltage": 12.0          // Used for 5V vs 12V detection
}
```

---

## Device-Specific Voltage Caps

The system now respects **hardware limitations** based on device type:

### **Example: Bitaxe Gamma 601 in Aggressive Mode**

```javascript
// config.json
AUTOTUNE: {
  aggressive: {
    maxVoltage: 1650  // Config says 1650mV
  }
}

// But Gamma 601 is 5V with 1500mV hardware limit
Device Limits: {
  maxVoltage: 1500  // Hardware can't do more than 1500mV
}

// Actual limit used: min(1650, 1500) = 1500mV
```

This prevents:
- Trying to push 12V voltages on 5V devices (damage risk)
- Exceeding safe limits for each device class
- Config mistakes causing hardware damage

---

## Log Output Changes

### **New Log Indicators**

**Device Detection:**
```
[AutoTune] 192.168.1.197: Detected ASIC model: BM1368
[AutoTune] 192.168.1.197: Detected device type: 12V (Max: 1650mV / 1400MHz)
```

**PLL Usage:**
```
[AutoTune] 192.168.1.197: PLL suggests 1355mV for 900MHz
[AutoTune] 192.168.1.197: 1300mV/875MHz -> 1343mV/900MHz (Action: increase_freq_with_pll [PLL], Temp: 65°C, ...)
```

**Heartbeat with Chip Info:**
```
[AutoTune] 192.168.1.197 [BM1368] (12V): 1380mV/1000MHz (68°C, Δ3.0°C, 0.01%, 15.2J/TH, Stable: 45, aggressive)
```

---

## API Changes

### **getAdaptiveLimits() - Enhanced Response**

```javascript
{
  "ip": "192.168.1.197",
  "adaptive": {
    "maxVoltage": 1480,
    "maxFreq": 1150,
    "faultHistory": [...]
  },
  "configLimits": {
    "maxVoltage": 1650,
    "maxFreq": 1400
  },
  "deviceLimits": {        // NEW
    "minVoltage": 1100,
    "maxVoltage": 1650,
    "maxFreq": 1400,
    "safetyMargin": 30
  },
  "asicModel": "BM1368",   // NEW
  "deviceType": "12V"      // NEW
}
```

---

## Migration from Current Version

### **Data Compatibility**

Existing `autotune_state.json` files are **fully compatible**. New fields are added automatically:

```json
{
  "192.168.1.197": {
    "enabled": true,
    "mode": "aggressive",
    "currentVoltage": 1350,
    "currentFreq": 900,
    "asicModel": null,        // Auto-detected on first run
    "deviceType": null,       // Auto-detected on first run
    "adaptiveLimits": { ... }
  }
}
```

On first run after upgrade:
1. System detects ASIC model → saved to state
2. System detects device type → saved to state
3. Continues normal operation with PLL guidance

### **Fallback Behavior**

If ASIC model or device type **cannot be detected**:
- Falls back to original blind stepping logic
- Still works, just without PLL optimization
- Logs: `[AutoTune] 192.168.1.197: Detected ASIC model: Unknown`

---

## Testing Recommendations

### **1. Test Device Detection**

Add logging to verify detection:
```javascript
socket.on('miner_update', (data) => {
  console.log('Device:', data.deviceModel);
  console.log('Chip:', data.chipInfo);
  console.log('Input Voltage:', data.inputVoltage);
});
```

### **2. Verify PLL Recommendations**

Watch logs for PLL usage:
```
[AutoTune] IP: PLL suggests XmV for YMHz
```

If you never see this, detection may have failed.

### **3. Check Device Limits**

Call the API:
```javascript
fetch('/api/autotune/192.168.1.197/adaptive-limits')
  .then(r => r.json())
  .then(d => console.log('Device limits:', d.deviceLimits));
```

### **4. Test 12V Device**

For NerdqAxe++ or GT 800:
- Should detect as "12V"
- Should show maxVoltage: 1650mV
- Should allow frequencies > 1000MHz

---

## Known Limitations

### **1. PLL Curves are Conservative**

The curves include safety margins and are based on community testing. Your specific chip might:
- Be able to run slightly lower voltage (adaptive limits will find this)
- Need slightly higher voltage (PLL + safety margin handles this)

### **2. No Voltage Droop Compensation**

The system doesn't measure **actual delivered voltage** vs requested. Some devices have:
- Voltage droop under load (requested 1300mV, delivered 1280mV)
- This is partially compensated by safety margins
- Future enhancement: measure actual voltage if available

### **3. Temperature Effects**

PLL curves don't account for temperature:
- Cold chip might be more efficient
- Hot chip might need more voltage
- The thermal management system handles this separately

### **4. Chip Variance**

Silicon lottery means two identical chips can have different requirements:
- One BM1368 might be stable at 900MHz/1300mV
- Another might need 900MHz/1350mV
- Adaptive limits learn the per-chip variation

---

## Future Enhancements

### **Potential Additions:**

1. **Voltage Droop Measurement**
   - Read actual delivered voltage from miners that report it
   - Adjust PLL recommendations based on droop

2. **Temperature-Compensated Curves**
   - Adjust voltage based on chip temperature
   - Lower voltage when cool, higher when hot

3. **Empirical Curve Learning**
   - Build chip-specific curves from observed stability
   - Refine PLL curves based on actual data

4. **Power Curve Modeling**
   - Predict power consumption based on V/F
   - Optimize for efficiency automatically

5. **Additional ASIC Models**
   - BM1387 (older chips)
   - Future Bitmain releases

---

## Troubleshooting

### **Device Detected as Wrong Type**

**Problem**: 12V device detected as 5V

**Solution**: Manually set in miner data
```javascript
// In your metadata endpoint
{
  "deviceModel": "NerdqAxe++",  // Forces 12V detection
  "inputVoltage": 12.0          // Also forces 12V
}
```

### **ASIC Model Not Detected**

**Problem**: Logs show "Unknown" chip

**Solution**: Check what the miner API returns
```javascript
// Verify chipInfo field
console.log(minerData.chipInfo);
console.log(minerData.ASICModel);
```

Add detection rule if needed:
```javascript
if (chipInfo.includes('your-chip-string')) return 'BM1368';
```

### **PLL Never Used**

**Problem**: No "PLL suggests" logs

**Causes**:
1. ASIC model not detected → add detection
2. Never increasing frequency → check thermal headroom
3. Already at max frequency → working as intended

### **Voltage Too High/Low**

**Problem**: PLL recommends voltage that's unstable or wasteful

**Solution**:
1. Verify curve is correct for your chip model
2. Adjust safety margin in `DEVICE_VOLTAGE_LIMITS`
3. Let adaptive limits refine the value
4. Report findings to help refine community curves

---

## Contributing PLL Data

If you have empirical data for voltage requirements:

1. **Test your chip systematically**
   - Find minimum stable voltage at various frequencies
   - Test at different temperatures
   - Multiple runs to verify stability

2. **Share your findings**
   - Format: `{freq: minVoltage}` pairs
   - Include: ASIC model, device type, ambient temp
   - Note any special conditions

3. **Help refine curves**
   - Report if PLL voltages are too high/low
   - Share your adaptive limits after long runs
   - Contribute to community knowledge base

---