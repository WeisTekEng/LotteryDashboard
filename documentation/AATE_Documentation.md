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
...
1000MHz → 1625mV
```

### **BM1366** (Bitaxe Supra)
```javascript
PLL Curve:
350MHz → 1120mV
...
1200MHz → 1700mV
```

### **BM1368** (Bitaxe Hex)
```javascript
PLL Curve:
350MHz → 1120mV
...
1600MHz → 1680mV
```

### **BM1370** (Bitaxe Gamma, NerdqAxe++)
**Used in**: Gamma 601, Gamma 901/903, NerdqAxe++

The BM1370 is Bitmain's newest chip (as of 2024) and more efficient than BM1368.

```javascript
PLL Curve (Partial):
400.00MHz → 941mV
500.00MHz → 986mV
600.00MHz → 1031mV
700.00MHz → 1076mV
800.00MHz → 1121mV
900.00MHz → 1166mV
1000.00MHz → 1211mV
1100.00MHz → 1256mV
1200.00MHz → 1301mV
(Full table in source code has 6.25MHz steps)
```

---

## Auto-Tune Engine Deep Dive

The Auto-Tune engine is an autonomous feedback system designed to find the optimal operating point for each individual ASIC chip. Since no two chips are identical due to manufacturing variance, the engine continuously monitors telemetry and makes intelligent micro-adjustments to maximize hashrate while maintaining stability and thermal safety.

**Bitaxe 601 - Gamma01 - Hashrate Increasing**
![Gamma01](Images/Gamma01HashIncreasing.PNG)
**Bitaxe 601 - Gamma02 - Hashrate Increasing**
![Gamma02](Images/Gamma02HashIncreasing.PNG)

### Core Architecture

The engine operates on a **10-30 second feedback loop** with a **frequency-first optimization philosophy**. This engine prioritizes frequency adjustments and uses voltage surgically, preventing a "voltage creep" problem where units end up at maximum voltage with low frequency.

### How It Works

#### 1. Telemetry Collection (Every 10-30s)
The engine fetches comprehensive real-time data from each miner:
- **Core Temperature**: Primary thermal metric
- **VRM Temperature**: Power delivery health
- **Input Voltage**: 5V rail monitoring (critical for fault detection)
- **Power Consumption**: Actual watts drawn
- **Hash Performance**: Actual vs expected hashrate
- **Error Rates**: Hardware errors and rejected shares
- **Share Statistics**: Valid/invalid share tracking

#### 2. Intelligent Analysis

**Stability Monitoring**
- Calculates a 5-cycle **moving average error rate** for stability
- Tracks hardware error deltas to detect sudden instability
- Monitors hashrate performance (actual vs expected)
- Distinguishes between minor variance and critical issues

**Thermal Management**
- Uses **5-cycle temperature moving average** to filter sensor noise
- Tracks temperature margins (target temp - actual temp)
- Detects impossible temperature drops (sensor glitches)
- Prevents over-reaction to transient thermal spikes

**Efficiency Analysis** (Conservative Mode)
- Calculates Joules per Terahash (J/TH)
- Compares against target efficiency
- Optimizes for cost-effectiveness, not just raw speed

**Adaptive Learning**
- Records critical faults with voltage/frequency context
- Sets per-unit maximum limits with safety margins
- Maintains fault history (last 10 faults)
- Respects learned limits in all future optimization decisions

#### 3. Priority-Based Decision Making

The engine uses a strict priority system to handle multiple conditions:

| Priority | Condition | Frequency Action | Voltage Action | Rationale |
|----------|-----------|-----------------|----------------|-----------|
| **1** | Critical Fault (API/Fallback/Range) | Safe baseline & Restart | Safe baseline & Restart | Guaranteed safe recovery + learns adaptive limits |
| **2** | Emergency (≥75°C) | Set to minimum | Set to minimum | Maximum cooling |
| **3** | Cost Overrun | Throttle Freq | Throttle Volt | Enforce daily budget |
| **4** | Soft Fault (VRM/Power) | -2× freqStep | -1× voltStep (if freq at min) | Immediate throttle, freq first |
| **5** | Temp Danger (≥Danger) | -2× freqStep | -1× voltStep (if needed) | Aggressive cooling |
| **6** | Temp Warning (≥Warning) | -1× freqStep | -1× voltStep (if freq at min) | Gradual cooling |
| **7** | Instability / Low Hash | -1× freqStep OR Boost Volt | +1× voltStep (if freq low) | Stabilize: Drop freq or add voltage |
| **8** | Optimization: Voltage Pullback | 0 | -1× voltStep | At Max V & Very Stable: Pull back to save power |
| **9** | Optimization: Efficiency Tuning | -1× freqStep | -1× voltStep | Target specific efficiency (Conservative Mode) |
| **10** | Optimization: Efficiency Headroom | +1× freqStep | PLL Optimized | Increase perf if efficient (Conservative Mode) |
| **11** | Optimization: Freq Headroom | +1-4× freqStep | PLL Optimized | **Main optimization path** (Climb Freq) |
| **12** | Optimization: Thermal Wall | 0 | -1× voltStep | Stable but hot: Cool down to unlock freq boost |
| **13** | Optimization: Max Freq Wall | 0 | -1× voltStep | Stable at Max Freq: Reduce voltage for efficiency |

#### 4. Adjustment Actions

**Frequency Scaling**
- Increases in 10-15MHz steps when conditions are optimal
- Scales increase rate based on temperature margin (1.5× faster if margin > 5°C)
- Reduces by 10MHz (warning) or 20MHz (danger) for thermal issues
- Always checks against **adaptive limits** before increasing

**Voltage Balancing**
- Small voltage bumps (+10mV) only when frequency reduction isn't viable
- Voltage reduction attempts during voltage pullback optimization
- Respects per-frequency voltage caps
- Never exceeds learned adaptive limits

**Stability Management**
- Tracks consecutive stable cycles
- Requires 5-30 stable cycles before allowing aggressive increases
- Resets stability counter on any adjustment
- Records "Last Known Good" state only at ≥80% of adaptive max frequency

### Adaptive Per-Unit Limits

**The Problem**: Hardware variance means some units can't reach the same limits as others. A unit with a marginal 5V power rail might fault at 1380mV/1200MHz, even though that's within spec for most units.

**The Solution**: Automatic per-unit limit learning.

#### How Adaptive Limits Work

1. **Fault Detection & Confirmation**
   - System detects critical fault (API fault, power fault, voltage out of range)
   - Waits for 3 consecutive fault cycles (30s) to confirm not transient
   - Records the exact voltage and frequency at which fault occurred

2. **Limit Calculation with Safety Margins**
   ```javascript
   // Example: Unit faults at 1380mV / 1200MHz
   Safety margins:
   - Voltage: 2 × voltageStep = 20-30mV
   - Frequency: 3 × freqStep = 30MHz
   
   New adaptive limits:
   - maxVoltage: 1380mV - 20mV = 1360mV
   - maxFreq: 1200MHz - 30MHz = 1170MHz
   ```

3. **Persistent Learning**
   - Limits saved to `autotune_state.json`
   - Survives restarts and redeployments
   - Maintains fault history with timestamps and reasons

4. **Enforcement**
   - All optimization decisions respect adaptive limits
   - Unit will never attempt to exceed learned safe values
   - "Last Known Good" tracking considers adaptive limits
   - Optimal state defined as ≥80% of adaptive max frequency

#### Example Log Output
**Auto-Tune Logs**
![Auto-tune logs](Images/LiveLogsAutoTuningEngine.PNG)
**Auto-Tune stabalizing**
![Units stabalizing](Images/LiveLogsAutoTuningEngine02.PNG)
**Auto-Tune Power fault detected, new hardware limits learned**
![Power Fault Detected and new hardware limits learned](Images/PowerFaultConfirmedAndLearned.PNG)

#### Use Cases for Adaptive Limits

**Case 1: Weak 5V Power Rail**
- **Problem**: Unit has 5V rail that sags under load, causing power faults at 1380mV/1200MHz
- **Solution**: AutoTune learns limits are 1360mV/1170MHz, operates stably at 99% of other units' performance
- **Result**: No constant faults, near-maximum hashrate maintained

**Case 2: Poor Cooling Environment**
- **Problem**: Unit in hot location can't reach maximum frequency without overheating
- **Solution**: Repeated thermal faults teach the system this unit's thermal ceiling
- **Result**: Unit optimizes to its environment, can be moved and limits reset later

**Case 3: Mixed Hardware Quality**
- **Problem**: Fleet of 10 units, 8 excellent, 2 marginal
- **Solution**: 8 units reach config max, 2 learn their own slightly lower limits
- **Result**: Zero manual intervention, each unit optimized individually

**Case 4: Silicon Lottery Winners**
- **Problem**: One unit has exceptional silicon, could run higher than config max
- **Solution**: Manually set higher adaptive limits for that unit only
- **Result**: Best chips pushed harder, average chips run at normal limits

---

## PLL System Mechanics (Detailed)

### **1. Device Detection (First Run)**

```javascript
// Automatic detection from miner API data
detectDeviceType(minerData) {
  const deviceName = (minerData.deviceModel || minerData.miner || '').toLowerCase();
  
  // 12V Devices (NerdqAxe++, GT, etc)
  if (deviceName.includes('nerdqaxe') || deviceName.includes('gt')) return '12V';
  
  // Gamma 601 (5V Enhanced)
  if (deviceName.includes('gamma') && deviceName.includes('601')) return 'Gamma601';
  
  // Check input voltage if available
  if (minerData.inputVoltage > 8) return '12V';
  
  // Default to standard 5V
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
- Exceeding safe limits for each device class
- Config mistakes causing hardware damage

---

## Operation Modes (Detailed)

### **Conservative Mode**
**Target Profile**: 24/7 uptime, efficiency-focused, minimal user intervention

**Parameters**:
- Voltage Range: 1150mV - 1250mV
- Frequency Range: 450MHz - 575MHz
- Temperature Target: 62°C
- Temperature Warning: 67°C
- Temperature Danger: 72°C
- Target Efficiency: 16 J/TH
- Max Error Rate: 5% (0.05)
- Adjustment Interval: 60 seconds (Step: 10mV / 10MHz)

### **Aggressive Mode**
**Target Profile**: Maximum hashrate, enthusiast-grade, active cooling required

**Parameters**:
- Voltage Range: 1150mV - 1380mV
- Frequency Range: 675MHz - 1200MHz
- Temperature Target: 71°C
- Temperature Warning: 72°C
- Temperature Danger: 73°C
- Max Error Rate: 1% (0.01)
- Adjustment Interval: 30 seconds
- Steps: Voltage 2.8125mV / Freq 6.25MHz

> [!WARNING]
> **Cooling**: Running aggressive mode on stock cooling will trigger constant thermal throttling. Upgrade to a larger heatsink or add/upgrade fans.

### **Cost Sensitive Mode (NEW)**
A "smart budget" mode that throttles performance to meet a financial target.

**Configuration:**
- **Electricity Price**: Your cost per kWh (e.g., $0.12).
- **Max Daily Cost**: The maximum amount you want to spend per miner per day (e.g., $1.50).

**How it works:**
1.  Calculates real-time daily cost: `(Watts / 1000) * 24 * Price`.
2.  **Priority Check**: If `CurrentCost > Limit`, it reduces frequency/voltage immediately.
3.  **Optimization**: Only attempts to increase frequency if there is "Cost Headroom".

---

## Dual-Stage Optimization

The Auto-Tune Engine now performs a two-stage optimization process to ensure maximum performance AND efficiency:

### **Stage 1: Frequency Maximization (The Climb)**
- The miner increases frequency as long as it is **Stable** and has **Thermal/Cost Headroom**.
- Voltage is adjusted automatically based on the PLL Table or Adaptive Limits.
- **Goal**: Reach the highest possible speed (e.g., 1200MHz or Target Temp 71°C).

### **Stage 2: Voltage Optimization (The Squeeze)**
- Once the miner hits a wall (Max Frequency, Thermal Limit, or Cost Limit) and becomes **Very Stable**, it switches strategy.
- It begins to **gradually lower the voltage** (`optimize_voltage` action).
- **Goal**: Maintain the peak frequency found in Stage 1 but with the minimum possible power consumption.
- This effectively finds the accurate "Silicon Lottery" voltage for that specific chip.

---

## Safety & Self-Healing Mechanisms

### **Emergency Cooling**
**Trigger**: Core temperature ≥ 75°C
**Action**: Immediate drop to minimum voltage and frequency
**Recovery**: Gradual ramp-up after temperature normalizes
**Purpose**: Prevent thermal damage to ASICs

### **Critical Fault Recovery**
**Triggers**: API reports power fault, Zero hashrate with power > 10W, Input voltage > 5.6V or < 4.8V.
**Actions**:
1. Learn adaptive limits from fault (voltage - 20mV, frequency - 30MHz)
2. Log fault to history
3. Revert to safe baseline & Restart
4. Lock out adjustments for 120 seconds

### **Soft Fault Handling**
**Triggers**: VRM temperature ≥ 85°C
**Action**: Immediate throttle without restart

### **Temperature Glitch Detection**
**Detection**: Core temp drops > 25°C to below 40°C in one cycle
**Action**: 
- **Transient (1-2 cycles)**: Ignore reading, log warning ("Verifying Sensor Glitch")
- **Persistent (3+ cycles)**: Treat as **Critical Fault** -> Revert to safe baseline & Restart

---

## Key Algorithm Improvements

The current engine represents significant improvements over traditional auto-tuning approaches:

### **1. Frequency-First Philosophy**
"Always prefer frequency adjustments, use voltage surgically"
- **Result**: High frequency operation, voltage only as needed
- **Key Insight**: Frequency affects power/heat/stability; voltage mainly affects stability
- **Therefore**: Use frequency as primary lever, voltage as fine-tuning

### **2. Nuanced Stability Response**
- High instability → Reduce frequency first (if headroom exists)
- Only add voltage if frequency already low
- Different severities get different responses
- No one-way voltage ratchet effect

### **3. Relaxed Frequency Increase Logic**
- Reduced cooldown to 5 cycles after throttling, 2 cycles normally
- Temperature margin consideration (won't increase if margin < 3°C)
- Scaled increase rate (1.5× faster if margin > 5°C)
- Simultaneous freq increase + voltage decrease when very stable

### **4. Smart Fault Recovery**
- Always revert to guaranteed-safe baseline
- Learn from fault and set adaptive limits
- Gradual climb from known-safe state
- Never attempt failed settings again

### **5. "Last Known Good" Tracking**
- Only records truly optimal states (30 cycles, < 1% error, ≥80% of adaptive max freq)
- Ensures "good" state is actually high-performance
- Considers adaptive limits, not just config limits

---

## Configuration Recommendations

### For Better Frequency Retention

```json
{
  "AUTOTUNE": {
    "conservative": {
      "tempTarget": 62,
      "tempWarning": 67,
      "tempDanger": 72,
      "maxErrorRate": 0.05,
      "freqStep": 10,
      "voltageStep": 10
    },
    "aggressive": {
      "tempTarget": 71,
      "tempWarning": 72,
      "tempDanger": 73,
      "maxErrorRate": 0.01,
      "freqStep": 6.25,
      "voltageStep": 2.8125
    }
  }
}
```

### Safety Margin Tuning

```javascript
// In fault handling section
const safetyMarginV = config.voltageStep * 2; // Default: 20-30mV
const safetyMarginF = config.freqStep * 3;    // Default: 30MHz
```

---

## Monitoring & Diagnostics

### Understanding Log Output

**New Enhanced Format**:
```
[AutoTune] 192.168.1.100: 1200mV/575MHz -> 1200mV/590MHz 
  (Action: increase_freq, Temp: 60°C, Margin: 3.0°C, 
   Error: 0.45%, Stable: 12)
```

**Key Metrics**:
- **Margin**: Temperature headroom (target - actual). Aim for 3-8°C
- **Error**: Smoothed error rate over last 5 cycles
- **Stable**: Consecutive stable cycles (higher = more confident in settings)

**Heartbeat Logs** (every ~1 minute when stable):
```
[AutoTune] 192.168.1.100: 1200mV/575MHz (60°C, Δ3.0°C, 0.45%, 15.2J/TH, Stable: 45, conservative)
```

### Good Signs ✅
- `increase_freq` actions happening regularly
- `increase_freq_reduce_voltage` (simultaneous optimization!)
- Stable count increasing (10, 20, 30+)
- Temperature margin steady at 3-8°C

### Warning Signs ⚠️
- Frequent `increase_stability_voltage` (stability issues)
- `instability_throttle_freq` repeating
- Adaptive limits significantly below config limits

### Bad Signs ❌
- Voltage at maximum for > 1 hour
- Frequency stuck at minimum
- Constant fault → restart → fault loop

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

Existing `autotune_state.json` files are **fully compatible**. New fields are added automatically.

---

## Testing Recommendations

### **1. Test Device Detection**
Add logging to verify detection.

### **2. Verify PLL Recommendations**
Watch logs for PLL usage.

### **3. Check Device Limits**
Call the API: `/api/autotune/192.168.1.197/adaptive-limits`.

---

## Known Limitations

### **1. PLL Curves are Conservative**
The curves include safety margins.

### **2. No Voltage Droop Compensation**
The system doesn't measure actual delivered voltage vs requested (yet).

### **3. Temperature Effects**
PLL curves don't account for temperature.

---

## Feature Roadmap

1. **Voltage Droop Measurement**
2. **Temperature-Compensated Curves**
3. **Empirical Curve Learning**

---

## Troubleshooting

### **Device Detected as Wrong Type**
Manually force type in miner data logic.

### **ASIC Model Not Detected**
Check miner API `chipInfo`.

### **PLL Never Used**
Verify detection and headroom.