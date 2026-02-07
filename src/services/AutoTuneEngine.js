const CONFIG = require('../config');
const StorageService = require('./StorageService');

// PLL Voltage Curves - Conservative community-tested values with safety margins
const PLL_VOLTAGE_CURVES = {
    'BM1397': {
        // NerdMiner, early Bitaxe Ultra - 5V devices
        400: 1120,
        450: 1150,
        500: 1160,
        525: 1170,
        550: 1180,
        575: 1200,
        600: 1220,
        625: 1250,
        650: 1275,
        675: 1300,
        700: 1325,
        725: 1350,
        750: 1375,
        775: 1400,
        800: 1425,
        825: 1450,
        850: 1475,
        875: 1500,
        900: 1525,
        925: 1550,
        950: 1575,
        975: 1600,
        1000: 1625
    },
    'BM1366': {
        // Bitaxe Supra - 5V device
        // More conservative curve
        350: 1120,
        400: 1150,
        450: 1160,
        500: 1180,
        550: 1200,
        600: 1230,
        650: 1260,
        700: 1300,
        750: 1340,
        800: 1380,
        850: 1420,
        900: 1460,
        950: 1500,
        1000: 1540,
        1050: 1580,
        1100: 1620,
        1150: 1660,
        1200: 1700
    },

    'BM1368': {
        // Bitaxe Hex (BM1368) – slightly stronger than BM1366
        350: 1120,
        400: 1150,
        450: 1160,
        500: 1170,
        600: 1200,
        700: 1240,
        800: 1280,
        900: 1330,
        1000: 1380,
        1100: 1430,
        1200: 1480,
        1300: 1530,
        1400: 1580,
        1500: 1630,
        1600: 1680
    },
    'BM1370': {
        400.00: 941,
        406.25: 944,
        412.50: 947,
        418.75: 950,
        425.00: 953,
        431.25: 955,
        437.50: 958,
        443.75: 961,
        450.00: 964,
        456.25: 967,
        462.50: 969,
        468.75: 972,
        475.00: 975,
        481.25: 978,
        487.50: 981,
        493.75: 983,
        500.00: 986,
        506.25: 989,
        512.50: 992,
        518.75: 995,
        525.00: 998,
        531.25: 1000,
        537.50: 1003,
        543.75: 1006,
        550.00: 1009,
        556.25: 1012,
        562.50: 1014,
        568.75: 1017,
        575.00: 1020,
        581.25: 1023,
        587.50: 1026,
        593.75: 1028,
        600.00: 1031,
        606.25: 1034,
        612.50: 1037,
        618.75: 1040,
        625.00: 1043,
        631.25: 1045,
        637.50: 1048,
        643.75: 1051,
        650.00: 1054,
        656.25: 1057,
        662.50: 1059,
        668.75: 1062,
        675.00: 1065,
        681.25: 1068,
        687.50: 1071,
        693.75: 1073,
        700.00: 1076,
        706.25: 1079,
        712.50: 1082,
        718.75: 1085,
        725.00: 1088,
        731.25: 1090,
        737.50: 1093,
        743.75: 1096,
        750.00: 1099,
        756.25: 1102,
        762.50: 1104,
        768.75: 1107,
        775.00: 1110,
        781.25: 1113,
        787.50: 1116,
        793.75: 1118,
        800.00: 1121,
        806.25: 1124,
        812.50: 1127,
        818.75: 1130,
        825.00: 1133,
        831.25: 1135,
        837.50: 1138,
        843.75: 1141,
        850.00: 1144,
        856.25: 1147,
        862.50: 1149,
        868.75: 1152,
        875.00: 1155,
        881.25: 1158,
        887.50: 1161,
        893.75: 1163,
        900.00: 1166,
        906.25: 1169,
        912.50: 1172,
        918.75: 1175,
        925.00: 1178,
        931.25: 1180,
        937.50: 1183,
        943.75: 1186,
        950.00: 1189,
        956.25: 1192,
        962.50: 1194,
        968.75: 1197,
        975.00: 1200,
        981.25: 1203,
        987.50: 1206,
        993.75: 1208,
        1000.00: 1211,
        1006.25: 1214,
        1012.50: 1217,
        1018.75: 1220,
        1025.00: 1223,
        1031.25: 1225,
        1037.50: 1228,
        1043.75: 1231,
        1050.00: 1234,
        1056.25: 1237,
        1062.50: 1239,
        1068.75: 1242,
        1075.00: 1245,
        1081.25: 1248,
        1087.50: 1251,
        1093.75: 1253,
        1100.00: 1256,
        1106.25: 1259,
        1112.50: 1262,
        1118.75: 1265,
        1125.00: 1268,
        1131.25: 1270,
        1137.50: 1273,
        1143.75: 1276,
        1150.00: 1279,
        1156.25: 1282,
        1162.50: 1284,
        1168.75: 1287,
        1175.00: 1290,
        1181.25: 1293,
        1187.50: 1296,
        1193.75: 1298,
        1200.00: 1301,
    }
};

// Device-specific voltage limits based on power architecture
const DEVICE_VOLTAGE_LIMITS = {
    // 5V Input Devices (USB-powered, standard Bitaxe)
    '5V': {
        minVoltage: 1100,
        maxVoltage: 1400,  // Safe limit for 5V rail
        maxFreq: 1200,
        safetyMargin: 20   // mV to add to PLL recommendation
    },
    // 12V Input Devices (NerdqAxe++, Bitaxe GT 800, etc.)
    '12V': {
        minVoltage: 1100,
        maxVoltage: 1400,  // Can push higher with 12V input
        maxFreq: 1200,
        safetyMargin: 30   // Slightly higher safety margin for 12V
    },
    // Bitaxe Gamma 601 (5V but higher limits than standard)
    'Gamma601': {
        minVoltage: 1100,
        maxVoltage: 1400,  // Higher than standard 5V
        maxFreq: 1200,
        safetyMargin: 25
    }
};

class AutoTuneEngine {
    constructor(autoTuneStates) {
        this.autoTuneStates = autoTuneStates || new Map();
    }

    /**
     * Detect ASIC chip model from miner data
     */
    detectASICModel(minerData) {
        const chipInfo = (minerData.chipInfo || '').toLowerCase();
        const model = (minerData.ASICModel || '').toLowerCase();
        const deviceName = (minerData.deviceModel || minerData.miner || '').toLowerCase();

        // Explicit chip model detection
        if (chipInfo.includes('1397') || model.includes('1397')) return 'BM1397';
        if (chipInfo.includes('1366') || model.includes('1366')) return 'BM1366';
        if (chipInfo.includes('1368') || model.includes('1368')) return 'BM1368';
        if (chipInfo.includes('1370') || model.includes('1370')) return 'BM1370';

        // Device-based detection (Gamma uses BM1370)
        if (deviceName.includes('gamma')) return 'BM1370';
        if (deviceName.includes('hex')) return 'BM1368';

        return null; // Unknown chip
    }

    /**
     * Detect device type and voltage limits from miner data
     */
    detectDeviceType(minerData) {
        const deviceName = (minerData.deviceModel || minerData.miner || minerData.hostname || '').toLowerCase();
        const version = (minerData.version || '').toLowerCase();

        // NerdqAxe++ detection (12V)
        if (deviceName.includes('nerdqaxe') || deviceName.includes('nerdq')) {
            return '12V';
        }

        // Bitaxe Gamma detection
        // Gamma 601 = 5V enhanced (1500mV max)
        // Gamma 901/903 = higher power, may need different limits
        if (deviceName.includes('gamma')) {
            if (deviceName.includes('601')) {
                return 'Gamma601';  // 5V, 1500mV max
            }
            // Check if it's a higher-power Gamma variant
            if (deviceName.includes('901') || deviceName.includes('903')) {
                return 'Gamma601';  // For now, treat same as 601
            }
            return 'Gamma601';  // Default for any Gamma
        }

        // Bitaxe GT/Hex detection
        if (deviceName.includes('hex')) {
            return '5V';  // Hex is standard 5V
        }

        // GT variants may be 12V
        if (deviceName.includes('gt')) {
            return '12V';
        }

        // Standard Bitaxe models (5V)
        if (deviceName.includes('ultra') || deviceName.includes('supra')) {
            return '5V';
        }

        // Check for explicit voltage in device data
        // Handle both inputVoltage (V) and voltage (mV)
        if (minerData.inputVoltage) {
            const voltage = parseFloat(minerData.inputVoltage);
            return voltage > 8 ? '12V' : '5V';
        }

        if (minerData.voltage) {
            const voltageMv = parseFloat(minerData.voltage);
            // If voltage is > 8V (8000mV), it's likely a 12V device
            return voltageMv > 8000 ? '12V' : '5V';
        }

        // Default to 5V (safer)
        return '5V';
    }

    /**
     * Get recommended voltage for a frequency using PLL curves
     * Returns null if no curve available (fallback to current logic)
     */
    getRecommendedVoltage(freq, asicModel, deviceType) {
        const curve = PLL_VOLTAGE_CURVES[asicModel];
        if (!curve) return null;

        const deviceLimits = DEVICE_VOLTAGE_LIMITS[deviceType] || DEVICE_VOLTAGE_LIMITS['5V'];

        // Find the curve points
        const freqPoints = Object.keys(curve).map(Number).sort((a, b) => a - b);

        // Linear interpolation between points
        let recommendedV = null;

        for (let i = 0; i < freqPoints.length; i++) {
            if (freq <= freqPoints[i]) {
                if (i === 0) {
                    // Below first point, use first point
                    recommendedV = curve[freqPoints[0]];
                } else {
                    // Interpolate between points
                    const f1 = freqPoints[i - 1];
                    const f2 = freqPoints[i];
                    const v1 = curve[f1];
                    const v2 = curve[f2];

                    const ratio = (freq - f1) / (f2 - f1);
                    recommendedV = Math.round(v1 + (v2 - v1) * ratio);
                }
                break;
            }
        }

        // If above highest point, use highest point
        if (recommendedV === null) {
            recommendedV = curve[freqPoints[freqPoints.length - 1]];
        }

        // Add safety margin
        recommendedV += deviceLimits.safetyMargin;

        // Clamp to device limits
        recommendedV = Math.max(deviceLimits.minVoltage, Math.min(deviceLimits.maxVoltage, recommendedV));

        return recommendedV;
    }

    /**
     * Get device-specific voltage cap (replaces simple frequency-based cap)
     */
    getDeviceVoltageCap(state, minerData) {
        const deviceType = state.deviceType || this.detectDeviceType(minerData);
        const deviceLimits = DEVICE_VOLTAGE_LIMITS[deviceType] || DEVICE_VOLTAGE_LIMITS['5V'];

        // Use mode-specific max voltage, but don't exceed device hardware limit
        const config = CONFIG.AUTOTUNE[state.mode] || CONFIG.AUTOTUNE['conservative'];
        return Math.min(config.maxVoltage, deviceLimits.maxVoltage);
    }

    calculateDailyCost(powerW, kwhPrice) {
        if (!powerW || !kwhPrice) return 0;
        // Watts / 1000 = kW * 24 hours * Price
        return (powerW / 1000) * 24 * kwhPrice;
    }

    async run(ip) {
        const state = this.autoTuneStates.get(ip);
        if (!state || !state.enabled) return;

        let config = CONFIG.AUTOTUNE[state.mode];
        if (!config) {
            console.warn(`[AutoTune] Missing config for mode '${state.mode}'. Defaulting to 'conservative'.`);
            config = CONFIG.AUTOTUNE['conservative'];
            // Optionally update state to match, or just use conservative limits for this run
        }

        const now = Date.now();

        if (now - state.lastAdjustment < config.adjustInterval) return;

        try {
            // Fetch miner data
            const resp = await fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(3000) });
            if (!resp.ok) return;

            const data = await resp.json();
            const temp = parseFloat(data.temp);
            const sharesAccepted = parseInt(data.sharesAccepted) || 0;
            const sharesRejected = parseInt(data.sharesRejected) || 0;
            const hashrate = parseFloat(data.hashRate) || 0;
            const expectedHashrate = parseFloat(data.expectedHashrate) || 0;
            const power = parseFloat(data.power) || 0;

            const currentHWErrorCount = data.hashrateMonitor?.asics?.[0]?.errorCount || 0;
            const hwErrorDelta = currentHWErrorCount - (state.lastErrorCount || 0);
            const vrTemp = parseFloat(data.vrTemp) || 0;
            const inputVolts = parseFloat(data.voltage) || 0;
            const hashPerformance = expectedHashrate > 0 ? (hashrate / expectedHashrate) : 1;

            // Cost Calculations
            const isCostSensitive = state.mode === 'cost_sensitive';
            const currentDailyCost = this.calculateDailyCost(power, state.kwhPrice);

            // Calculate error rate
            let liveErrorRate = 0;
            if (data.errorPercentage !== undefined) {
                liveErrorRate = parseFloat(data.errorPercentage) / 100;
            } else {
                const deltaValid = sharesAccepted - (state.lastShares?.valid || 0);
                const deltaInvalid = sharesRejected - (state.lastShares?.invalid || 0);
                const totalDelta = deltaValid + deltaInvalid;
                liveErrorRate = totalDelta > 0 ? deltaInvalid / totalDelta : 0;
            }

            // Moving averages
            state.tempHistory = state.tempHistory || [];
            state.tempHistory.push(temp);
            if (state.tempHistory.length > 5) state.tempHistory.shift();
            const avgTemp = state.tempHistory.reduce((a, b) => a + b, 0) / state.tempHistory.length;

            state.errorHistory = state.errorHistory || [];
            state.errorHistory.push(liveErrorRate);
            if (state.errorHistory.length > 5) state.errorHistory.shift();
            const smoothErrorRate = state.errorHistory.reduce((a, b) => a + b, 0) / state.errorHistory.length;

            // Sync with actual miner state
            // If the reported voltage is close to our last set voltage (within rounding error), 
            // keep our high-precision value instead of the miner's rounded integer.
            if (Math.abs((data.coreVoltage || 0) - (state.currentVoltage || 0)) > 1.5) {
                state.currentVoltage = data.coreVoltage;
            }
            state.currentFreq = data.frequency;

            // --- HISTORY LOGGING ---
            state.tuningLog = state.tuningLog || [];
            state.tuningLog.push({
                timestamp: now,
                voltage: state.currentVoltage,
                freq: state.currentFreq,
                hashrate: hashrate,
                power: power,
                temp: avgTemp, // Use smoothed temp
                errorRate: smoothErrorRate,
                action: state.lastAction || 'maintain' // Log the action that RESULTED in this state (approx) or current
            });
            // Limit log size (500 entries ~ 1-2 days depending on interval)
            if (state.tuningLog.length > 500) {
                state.tuningLog.shift();
            }


            // NEW: Detect ASIC model and device type (once)
            if (!state.asicModel) {
                state.asicModel = this.detectASICModel(data);
                console.log(`[AutoTune] ${ip}: Detected ASIC model: ${state.asicModel || 'Unknown'}`);
            }
            if (!state.deviceType) {
                state.deviceType = this.detectDeviceType(data);
                const deviceLimits = DEVICE_VOLTAGE_LIMITS[state.deviceType];
                console.log(`[AutoTune] ${ip}: Detected device type: ${state.deviceType} (Max: ${deviceLimits.maxVoltage}mV / ${deviceLimits.maxFreq}MHz)`);
                StorageService.saveAutoTuneState(this.autoTuneStates);
            }

            // Get device-specific voltage cap
            const freqVoltageCap = this.getDeviceVoltageCap(state, data);

            // Calculate current efficiency
            let efficiency = null;
            if (config.targetEfficiency && hashrate > 0 && power > 0) {
                efficiency = power / (hashrate / 1000);
            }

            // Fault detection
            const hasApiFault = data.power_fault && data.power_fault.includes("Fault");
            const isUnderperforming = expectedHashrate > 100 && hashrate < (expectedHashrate * 0.05);
            const isFallbackFault = isUnderperforming && power < 10.0 && state.currentFreq > config.minFreq;
            const isVrTooHot = vrTemp >= config.maxVrTemp;
            const isInputVoltsOutOfRange = inputVolts > 0 && (inputVolts < config.minInputVolts || inputVolts > config.maxInputVolts);
            const isPowerTooHigh = power > config.maxWatts;

            const isCriticalFault = hasApiFault || isFallbackFault || isInputVoltsOutOfRange;
            const isSoftFault = isVrTooHot || isPowerTooHigh;

            // Temperature glitch detection
            const lastTemp = state.lastSeenTemp || temp;
            const tempDrop = lastTemp - temp;
            const isTempGlitch = tempDrop > 25 && temp < 40;
            state.lastSeenTemp = temp;

            // === CRITICAL FAULT HANDLING (Priority 1) ===
            if (isCriticalFault) {
                state.faultCounter = (state.faultCounter || 0) + 1;
                const reasons = [];
                if (hasApiFault) reasons.push(`API_FAULT(${data.power_fault})`);
                if (isFallbackFault) reasons.push(`FALLBACK_FAULT(${hashrate.toFixed(0)}H/${power.toFixed(1)}W)`);
                if (isInputVoltsOutOfRange) reasons.push(`VOLTAGE_OUT_OF_RANGE(${inputVolts}mV)`);
                if (isTempGlitch) reasons.push(`TEMP_GLITCH_DETECTED(-${tempDrop.toFixed(1)}C)`);

                if (state.faultCounter >= 3 && !state.restarting && now > state.stabilizationUntil) {
                    // Learn adaptive limits
                    const faultVoltage = state.currentVoltage;
                    const faultFreq = state.currentFreq;

                    state.adaptiveLimits = state.adaptiveLimits || {
                        maxVoltage: freqVoltageCap,
                        maxFreq: config.maxFreq
                    };

                    const safetyMarginV = config.voltageStep * 2;
                    const safetyMarginF = config.freqStep * 3;

                    const newMaxVoltage = Math.max(config.minVoltage, faultVoltage - safetyMarginV);
                    const newMaxFreq = Math.max(config.minFreq, faultFreq - safetyMarginF);

                    const voltageReduced = newMaxVoltage < state.adaptiveLimits.maxVoltage;
                    const freqReduced = newMaxFreq < state.adaptiveLimits.maxFreq;

                    if (voltageReduced || freqReduced) {
                        state.adaptiveLimits.maxVoltage = Math.min(state.adaptiveLimits.maxVoltage, newMaxVoltage);
                        state.adaptiveLimits.maxFreq = Math.min(state.adaptiveLimits.maxFreq, newMaxFreq);

                        console.warn(`[AutoTune] ${ip}: LEARNED FROM FAULT! Reducing limits: V=${freqVoltageCap}mV->${state.adaptiveLimits.maxVoltage}mV, F=${config.maxFreq}MHz->${state.adaptiveLimits.maxFreq}MHz`);
                    }

                    // Log fault to history
                    state.faultHistory = state.faultHistory || [];
                    state.faultHistory.push({
                        timestamp: now,
                        voltage: faultVoltage,
                        freq: faultFreq,
                        reason: reasons.join(', '),
                        newLimits: {
                            maxVoltage: state.adaptiveLimits.maxVoltage,
                            maxFreq: state.adaptiveLimits.maxFreq
                        },
                        limitsAdapted: voltageReduced || freqReduced
                    });

                    // Keep last 50 faults
                    if (state.faultHistory.length > 50) {
                        state.faultHistory.shift();
                    }

                    // NEW: Use PLL curve for recovery if available
                    let targetVoltage, targetFreq;
                    if (state.asicModel) {
                        targetFreq = config.minFreq + (config.freqStep * 10);
                        targetVoltage = this.getRecommendedVoltage(targetFreq, state.asicModel, state.deviceType) ||
                            (config.minVoltage + (config.voltageStep * 5));
                        console.log(`[AutoTune] ${ip}: Using PLL recovery: ${targetVoltage}mV for ${targetFreq}MHz`);
                    } else {
                        targetVoltage = Math.min(config.minVoltage + (config.voltageStep * 5), state.adaptiveLimits.maxVoltage);
                        targetFreq = Math.min(config.minFreq + (config.freqStep * 10), state.adaptiveLimits.maxFreq);
                    }

                    console.warn(`[AutoTune] ${ip}: CRITICAL FAULT CONFIRMED! Reason: ${reasons.join(', ')}. Reverting to safe baseline (${targetVoltage}mV/${targetFreq}MHz) and restarting...`);

                    this.applySettings(ip, targetVoltage, targetFreq, true);
                    state.currentVoltage = targetVoltage;
                    state.currentFreq = targetFreq;
                    state.stabilizationUntil = now + 120000;
                    state.restarting = true;
                    state.lastAdjustment = now;
                    state.faultCounter = 0;
                    state.stableCycleCount = 0;
                    StorageService.saveAutoTuneState(this.autoTuneStates);
                    return;
                } else if (!state.restarting) {
                    const verb = isTempGlitch ? 'Sensor glitch' : 'Potential critical fault';
                    console.log(`[AutoTune] ${ip}: ${verb} detected (${reasons.join(', ')}). Verifying (Cycle ${state.faultCounter}/3)...`);
                }
            } else {
                state.faultCounter = 0;
            }

            let newVoltage = state.currentVoltage;
            let newFreq = state.currentFreq;
            let action = 'maintain';

            const isStabilizing = now < state.stabilizationUntil;

            // === POST-RESTART RECOVERY ===
            if (state.restarting && now >= state.stabilizationUntil) {
                state.restarting = false;
                newVoltage = state.currentVoltage;
                newFreq = state.currentFreq;
                action = 'post_restart_recovery';
                state.stableCycleCount = 0;
            }
            // === PRIORITY 2: EMERGENCY COOLING ===
            else if (temp >= 75) {
                newVoltage = config.minVoltage;
                newFreq = config.minFreq;
                action = 'EMERGENCY_COOLING';
                state.stableCycleCount = 0;
            }
            // === PRIORITY 3: COST OVERRUN (Cost Sensitive Mode) ===
            else if (isCostSensitive && state.dailyCostLimit && currentDailyCost > state.dailyCostLimit) {
                if (state.currentFreq > config.minFreq) {
                    newFreq = Math.max(config.minFreq, state.currentFreq - (config.freqStep * 2));
                    action = 'cost_throttle_freq';
                } else {
                    newVoltage = Math.max(config.minVoltage, state.currentVoltage - config.voltageStep);
                    action = 'cost_throttle_voltage';
                }
                state.stableCycleCount = 0;
            }
            // === PRIORITY 3.5: SOFT FAULT ===
            else if (isSoftFault && !state.restarting && now > state.stabilizationUntil) {
                const softReasons = [];
                if (isVrTooHot) softReasons.push(`VR_HOT(${vrTemp}C)`);
                if (isPowerTooHigh) softReasons.push(`POWER_LIMIT(${power}W)`);

                newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep * 2);
                if (newFreq === config.minFreq) {
                    newVoltage = Math.max(config.minVoltage, state.currentVoltage - config.voltageStep);
                }
                action = isVrTooHot ? 'VR_TEMP_THROTTLE' : 'POWER_LIMIT_THROTTLE';

                console.warn(`[AutoTune] ${ip}: SOFT FAULT! Reason: ${softReasons.join(', ')}. Throttling to ${newVoltage}mV/${newFreq}MHz...`);
                state.stableCycleCount = 0;
            }
            // === PRIORITY 4: THERMAL DANGER ===
            else if (avgTemp >= config.tempDanger) {
                newFreq = Math.max(config.minFreq, newFreq - config.freqStep * 2);
                if (newFreq > config.minFreq || state.currentVoltage > config.minVoltage + config.voltageStep) {
                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                }
                action = 'decrease_temp_aggressive';
                state.stableCycleCount = 0;
            }
            // === PRIORITY 5: THERMAL WARNING ===
            else if (avgTemp >= config.tempWarning) {
                newFreq = Math.max(config.minFreq, newFreq - config.freqStep);
                if (newFreq === config.minFreq && avgTemp >= config.tempWarning + 1) {
                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                }
                action = 'decrease_temp_warning';
                state.stableCycleCount = 0;
            }
            // === PRIORITY 6: STABILITY ISSUES ===
            else if (smoothErrorRate > config.maxErrorRate ||
                hwErrorDelta > (state.mode === 'aggressive' ? 50 : 5) ||
                hashPerformance < 0.94) {

                const isHighError = smoothErrorRate > config.maxErrorRate;
                const isLowHash = hashPerformance < 0.94;

                const failedOptimization = ['voltage_pullback_optimization', 'tune_for_efficiency'].includes(state.lastAction);

                if (failedOptimization) {
                    newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                    action = 'instability_revert_optimization';
                } else if (isHighError || hwErrorDelta > 20) {
                    if (state.currentFreq > config.minFreq + (config.freqStep * 5)) {
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        action = 'instability_throttle_freq';
                    } else if (state.currentVoltage < freqVoltageCap) {
                        newVoltage = Math.min(freqVoltageCap, newVoltage + config.voltageStep);
                        action = 'increase_stability_voltage';
                    } else {
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        action = 'instability_throttle_freq';
                    }
                } else if (isLowHash) {
                    if (state.currentVoltage < freqVoltageCap - config.voltageStep) {
                        newVoltage = Math.min(freqVoltageCap, newVoltage + config.voltageStep);
                        action = 'hashrate_stability_boost';
                    } else {
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        action = 'hashrate_throttle';
                    }
                }
                state.stableCycleCount = 0;
            }
            // === PRIORITY 7-10: OPTIMIZATION ===
            else if (avgTemp < config.tempTarget) {
                // Use per-unit adaptive limits if they exist
                state.adaptiveLimits = state.adaptiveLimits || {
                    maxVoltage: freqVoltageCap,
                    maxFreq: config.maxFreq,
                    faultHistory: []
                };
                const effectiveMaxVoltage = state.adaptiveLimits.maxVoltage;
                const effectiveMaxFreq = state.adaptiveLimits.maxFreq;

                // Cost Headroom Check
                const hasCostHeadroom = !isCostSensitive || !state.dailyCostLimit || currentDailyCost < state.dailyCostLimit;

                const hasFreqHeadroom = newFreq < effectiveMaxFreq && hasCostHeadroom;
                const hasVoltageHeadroom = newVoltage < effectiveMaxVoltage && hasCostHeadroom;
                const isVeryStable = (state.stableCycleCount || 0) >= 10 && smoothErrorRate < 0.01;
                const isStable = (state.stableCycleCount || 0) >= 5 && smoothErrorRate < 0.02;

                // Priority 10: Voltage pullback
                if (newVoltage === effectiveMaxVoltage && isVeryStable && !hasFreqHeadroom) {
                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                    action = 'voltage_pullback_optimization';
                    state.stableCycleCount = 0;
                }
                // Priority 8: Efficiency tuning
                else if (efficiency !== null && efficiency > config.targetEfficiency + 0.5) {
                    newFreq = Math.max(config.minFreq, newFreq - config.freqStep);
                    if (newFreq === config.minFreq) {
                        newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                    }
                    action = 'tune_for_efficiency';
                    state.stableCycleCount = 0;
                }
                // Priority 9: Efficiency headroom
                else if (efficiency !== null && efficiency < config.targetEfficiency - 0.5 && hasFreqHeadroom) {
                    newFreq = Math.min(effectiveMaxFreq, newFreq + config.freqStep);

                    // NEW: Use PLL curve to set optimal voltage for new frequency
                    if (state.asicModel) {
                        const currentBaseV = this.getRecommendedVoltage(state.currentFreq, state.asicModel, state.deviceType);
                        const newBaseV = this.getRecommendedVoltage(newFreq, state.asicModel, state.deviceType);

                        if (currentBaseV !== null && newBaseV !== null) {
                            // Calculate offset from the curve at current frequency
                            const offset = state.currentVoltage - currentBaseV;
                            // Apply offset to the new base voltage
                            let targetV = newBaseV + offset;
                            // Clamp to safe limits
                            targetV = Math.max(config.minVoltage, Math.min(effectiveMaxVoltage, targetV));

                            if (targetV > newVoltage) {
                                newVoltage = targetV;
                                action = 'increase_freq_with_pll_offset';
                                console.log(`[AutoTune] ${ip}: PLL+Offset suggests ${targetV}mV (Base ${newBaseV} + ${offset}) for ${newFreq}MHz`);
                            } else {
                                action = 'increase_freq_efficiency';
                            }
                        } else if (newBaseV && newBaseV > newVoltage) {
                            // Fallback to standard PLL if current base missing
                            newVoltage = Math.min(effectiveMaxVoltage, newBaseV);
                            action = 'increase_freq_with_pll';
                            console.log(`[AutoTune] ${ip}: PLL suggests ${newBaseV}mV for ${newFreq}MHz`);
                        } else {
                            action = 'increase_freq_efficiency';
                        }
                    } else {
                        action = 'increase_freq_efficiency';
                    }
                    state.stableCycleCount = 0;
                }
                // Priority 7: Main optimization path - frequency increase
                else if (hasFreqHeadroom) {
                    const recentThrottle = ['instability_throttle_freq', 'instability_revert_optimization'].includes(state.lastAction);
                    const cooldownNeeded = recentThrottle ? 5 : 2;
                    const tempMargin = config.tempTarget - avgTemp;

                    if (isStable && (state.stableCycleCount >= cooldownNeeded) && tempMargin > 3) {
                        const isApproachingTarget = tempMargin < 5;

                        // Adaptive Frequency Steps
                        const distToMax = effectiveMaxFreq - state.currentFreq;
                        let adaptiveStep = config.freqStep;

                        if (distToMax > 100) adaptiveStep = config.freqStep * 4;      // e.g. +40MHz
                        else if (distToMax > 50) adaptiveStep = config.freqStep * 2;  // e.g. +20MHz

                        let freqIncrease = isApproachingTarget ? config.freqStep : adaptiveStep;

                        // Ensure we don't overshoot
                        if (freqIncrease > distToMax) freqIncrease = distToMax;

                        // Enforce minimum step if not at limit
                        if (freqIncrease < config.freqStep && distToMax >= config.freqStep) freqIncrease = config.freqStep;

                        newFreq = Math.min(effectiveMaxFreq, newFreq + freqIncrease);

                        // NEW: Use PLL curve to set optimal voltage for new frequency
                        if (state.asicModel) {
                            const currentBaseV = this.getRecommendedVoltage(state.currentFreq, state.asicModel, state.deviceType);
                            const newBaseV = this.getRecommendedVoltage(newFreq, state.asicModel, state.deviceType);

                            if (currentBaseV !== null && newBaseV !== null) {
                                // Calculate offset from the curve at current frequency
                                const offset = state.currentVoltage - currentBaseV;
                                // Apply offset to the new base voltage
                                let targetV = newBaseV + offset;
                                // Clamp to safe limits
                                targetV = Math.max(config.minVoltage, Math.min(effectiveMaxVoltage, targetV));

                                if (targetV > newVoltage) {
                                    newVoltage = targetV;
                                    action = 'increase_freq_with_pll_offset';
                                    console.log(`[AutoTune] ${ip}: PLL+Offset suggests ${targetV}mV (Base ${newBaseV} + ${offset}) for ${newFreq}MHz`);
                                } else {
                                    action = 'increase_freq';
                                    // Try reducing voltage if very stable and PLL says we can (and targetV is lower)
                                    // Using targetV here respects the offset logic even for reduction
                                    if (newVoltage > config.minVoltage + (config.voltageStep * 3) && isVeryStable && targetV < newVoltage) {
                                        newVoltage = Math.max(config.minVoltage, targetV);
                                        action = 'increase_freq_reduce_voltage_pll';
                                    }
                                }
                            } else if (newBaseV) {
                                // Fallback logic if current base is missing
                                if (newBaseV > newVoltage) {
                                    newVoltage = Math.min(effectiveMaxVoltage, newBaseV);
                                    action = 'increase_freq_with_pll';
                                    console.log(`[AutoTune] ${ip}: PLL suggests ${newBaseV}mV for ${newFreq}MHz`);
                                } else {
                                    action = 'increase_freq';
                                    if (newVoltage > config.minVoltage + (config.voltageStep * 3) && isVeryStable && newBaseV < newVoltage) {
                                        newVoltage = Math.max(config.minVoltage, newBaseV);
                                        action = 'increase_freq_reduce_voltage_pll';
                                    }
                                }
                            } else {
                                // No PLL data
                                action = 'increase_freq';
                                if (newVoltage > config.minVoltage + (config.voltageStep * 3) && isVeryStable) {
                                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                                    action = 'increase_freq_reduce_voltage';
                                }
                            }
                        } else {
                            // No PLL data, use existing logic
                            action = 'increase_freq';
                            if (newVoltage > config.minVoltage + (config.voltageStep * 3) && isVeryStable) {
                                newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                                action = 'increase_freq_reduce_voltage';
                            }
                        }
                        state.stableCycleCount = 0;
                    } else if (isVeryStable && state.currentVoltage > config.minVoltage + (config.voltageStep * 3)) {
                        // Thermal Wall: Temp is tight (< 1.0 margin), so we reduce voltage to cool down and allow future boost
                        newVoltage = Math.max(config.minVoltage, state.currentVoltage - config.voltageStep);
                        action = 'optimize_voltage_thermal';
                        state.stableCycleCount = 0;
                    } else {
                        action = 'maintain';
                    }
                }
                else if (isVeryStable && state.currentVoltage > config.minVoltage + (config.voltageStep * 3)) {
                    // Max Frequency Reached (or Cost Limit) -> Optimize Efficiency
                    newVoltage = Math.max(config.minVoltage, state.currentVoltage - config.voltageStep);
                    action = 'optimize_voltage_max_freq';
                    state.stableCycleCount = 0;
                }
                else {
                    action = 'maintain';
                }
            }

            // Track stability and last known good
            if (action === 'maintain' || action === 'stabilizing') {
                state.stableCycleCount = (state.stableCycleCount || 0) + 1;

                state.adaptiveLimits = state.adaptiveLimits || {
                    maxVoltage: freqVoltageCap,
                    maxFreq: config.maxFreq,
                    faultHistory: []
                };
                const effectiveMaxFreq = state.adaptiveLimits.maxFreq;

                const isOptimalState = state.stableCycleCount >= 30 &&
                    smoothErrorRate < 0.01 &&
                    state.currentFreq >= effectiveMaxFreq * 0.8;

                if (isOptimalState) {
                    if (state.lastGoodVoltage !== state.currentVoltage || state.lastGoodFreq !== state.currentFreq) {
                        state.lastGoodVoltage = state.currentVoltage;
                        state.lastGoodFreq = state.currentFreq;
                        console.log(`[AutoTune] ${ip}: Recorded new optimal state: ${state.lastGoodVoltage}mV/${state.lastGoodFreq}MHz (${(state.currentFreq / effectiveMaxFreq * 100).toFixed(0)}% of adaptive max)`);
                        StorageService.saveAutoTuneState(this.autoTuneStates);
                    }
                }
            }

            // Respect stabilization period
            if (isStabilizing && !['EMERGENCY_COOLING', 'decrease_temp_warning', 'decrease_temp_aggressive'].includes(action)) {
                if (newFreq > state.currentFreq || newVoltage > state.currentVoltage) {
                    newFreq = state.currentFreq;
                    newVoltage = state.currentVoltage;
                    action = 'stabilizing';
                }
            }

            // Apply voltage cap
            const nextVoltageCap = this.getDeviceVoltageCap(state, data);
            if (newVoltage > nextVoltageCap) {
                newVoltage = nextVoltageCap;
                if (!['EMERGENCY_COOLING', 'decrease_temp_warning', 'decrease_temp_aggressive'].includes(action)) {
                    action = 'vf_curve_cap';
                }
            }

            // Update state tracking
            state.lastShares = { valid: sharesAccepted, invalid: sharesRejected };
            state.lastErrorCount = currentHWErrorCount;
            state.lastAction = action;
            StorageService.saveAutoTuneState(this.autoTuneStates);

            // Apply changes
            if (newVoltage !== state.currentVoltage || newFreq !== state.currentFreq) {
                const pllIndicator = action.includes('pll') ? ' [PLL]' : '';
                console.log(`[AutoTune] ${ip}: ${state.currentVoltage}mV/${state.currentFreq}MHz -> ${newVoltage}mV/${newFreq}MHz (Action: ${action}${pllIndicator}, Temp: ${temp}°C, Err: ${(smoothErrorRate * 100).toFixed(2)}%, HW: ${hwErrorDelta}, Perf: ${(hashPerformance * 100).toFixed(1)}%, Stable: ${state.stableCycleCount})`);
                this.applySettings(ip, newVoltage, newFreq).catch(e => console.error(`[AutoTune] ${ip} Apply Error:`, e.message));
                state.currentVoltage = newVoltage;
                state.currentFreq = newFreq;
                state.lastAdjustment = now;
                StorageService.saveAutoTuneState(this.autoTuneStates);
            } else {
                // Heartbeat
                state.heartbeatCount = (state.heartbeatCount || 0) + 1;
                if (state.heartbeatCount >= 6) {
                    const effStr = efficiency !== null ? `, ${efficiency.toFixed(1)}J/TH` : '';
                    const chipStr = state.asicModel ? ` [${state.asicModel}]` : '';
                    const deviceStr = state.deviceType !== '5V' ? ` (${state.deviceType})` : '';
                    console.log(`[AutoTune] ${ip}${chipStr}${deviceStr}: ${state.currentVoltage}mV/${state.currentFreq}MHz (${temp}°C, Δ${(config.tempTarget - temp).toFixed(1)}°C, ${(smoothErrorRate * 100).toFixed(2)}%${effStr}, Stable: ${state.stableCycleCount}, ${state.mode})`);
                    state.heartbeatCount = 0;
                }
            }
        } catch (e) {
            console.error(`[AutoTune] ${ip} check error:`, e.message);
        }
    }

    async applySettings(ip, voltage, freq, restart = false) {
        const sentVoltage = Math.round(voltage);
        console.log(`[AutoTune] ${ip}: Sending command -> ${sentVoltage}mV (${voltage.toFixed(2)}), ${freq}MHz`);
        try {
            const res = await fetch(`http://${ip}/api/system`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coreVoltage: sentVoltage, frequency: freq })
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text}`);
            }
            console.log(`[AutoTune] ${ip}: Settings applied successfully.`);
            if (restart) {
                console.log(`[AutoTune] ${ip}: Restarting miner...`);
                await fetch(`http://${ip}/api/system/restart`, { method: 'POST' });
            }
        } catch (e) {
            console.error(`[AutoTune] ${ip}: Failed to apply settings: ${e.message}`);
        }
    }

    startLoop() {
        setInterval(() => {
            if (this.autoTuneStates.size === 0) return;
            this.autoTuneStates.forEach((state, ip) => {
                if (state.enabled) this.run(ip).catch(e => console.error(`[AutoTune] Loop error for ${ip}:`, e.message));
            });
        }, CONFIG.LIMITS.AUTOTUNE_LOOP_INTERVAL);
    }

    // Get adaptive limits for a specific miner
    getAdaptiveLimits(ip) {
        const state = this.autoTuneStates.get(ip);
        if (!state) return null;

        const config = CONFIG.AUTOTUNE[state.mode];
        const deviceType = state.deviceType || '5V';
        const deviceLimits = DEVICE_VOLTAGE_LIMITS[deviceType];

        return {
            adaptiveLimits: state.adaptiveLimits || {
                maxVoltage: Math.min(config.maxVoltage, deviceLimits.maxVoltage),
                maxFreq: Math.min(config.maxFreq, deviceLimits.maxFreq)
            },
            faultHistory: state.faultHistory || [],
            configLimits: {
                maxVoltage: config.maxVoltage,
                maxFreq: config.maxFreq,
                kwhPrice: state.kwhPrice,
                dailyCostLimit: state.dailyCostLimit
            },
            deviceLimits: deviceLimits,
            asicModel: state.asicModel,
            deviceType: state.deviceType
        };
    }

    // Reset adaptive limits to config defaults
    resetAdaptiveLimits(ip) {
        const state = this.autoTuneStates.get(ip);
        if (!state) return false;

        const config = CONFIG.AUTOTUNE[state.mode];
        const deviceType = state.deviceType || '5V';
        const deviceLimits = DEVICE_VOLTAGE_LIMITS[deviceType];

        state.adaptiveLimits = {
            maxVoltage: Math.min(config.maxVoltage, deviceLimits.maxVoltage),
            maxFreq: Math.min(config.maxFreq, deviceLimits.maxFreq)
        };

        console.log(`[AutoTune] ${ip}: Reset adaptive limits to config defaults (${state.adaptiveLimits.maxVoltage}mV/${state.adaptiveLimits.maxFreq}MHz)`);
        StorageService.saveAutoTuneState(this.autoTuneStates);
        return true;
    }

    // Manually set adaptive limits
    setAdaptiveLimits(ip, maxVoltage, maxFreq) {
        const state = this.autoTuneStates.get(ip);
        if (!state) return false;

        const config = CONFIG.AUTOTUNE[state.mode];
        const deviceType = state.deviceType || '5V';
        const deviceLimits = DEVICE_VOLTAGE_LIMITS[deviceType];

        // Validate against device hardware limits
        if (maxVoltage < config.minVoltage || maxVoltage > deviceLimits.maxVoltage ||
            maxFreq < config.minFreq || maxFreq > deviceLimits.maxFreq) {
            console.error(`[AutoTune] ${ip}: Invalid limits. Must be within ${config.minVoltage}-${deviceLimits.maxVoltage}mV and ${config.minFreq}-${deviceLimits.maxFreq}MHz for ${deviceType} device`);
            return false;
        }

        state.adaptiveLimits = state.adaptiveLimits || {};
        state.adaptiveLimits.maxVoltage = maxVoltage;
        state.adaptiveLimits.maxFreq = maxFreq;

        console.log(`[AutoTune] ${ip}: Manually set adaptive limits to ${maxVoltage}mV/${maxFreq}MHz`);
        StorageService.saveAutoTuneState(this.autoTuneStates);
        return true;
    }
}

module.exports = AutoTuneEngine;