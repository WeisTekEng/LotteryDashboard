const CONFIG = require('../config');
const StorageService = require('./StorageService');
const { DEVICE_VOLTAGE_LIMITS, INPUT_VOLTAGE_LIMITS } = require('./autotune/AutoTuneConstants');
const DeviceDetector = require('./autotune/DeviceDetector');
const TuningLogic = require('./autotune/TuningLogic');
const FaultDetector = require('./autotune/FaultDetector');

class AutoTuneEngine {
    constructor(autoTuneStates) {
        this.autoTuneStates = autoTuneStates || new Map();
    }

    /**
     * Detect ASIC chip model from miner data
     */
    detectASICModel(minerData) {
        return DeviceDetector.detectASICModel(minerData);
    }

    /**
     * Detect device type and voltage limits from miner data
     */
    detectDeviceType(minerData) {
        return DeviceDetector.detectDeviceType(minerData);
    }

    /**
     * Get recommended voltage for a frequency using PLL curves
     * Returns null if no curve available (fallback to current logic)
     */
    getRecommendedVoltage(freq, asicModel, deviceType) {
        return TuningLogic.getRecommendedVoltage(freq, asicModel, deviceType);
    }

    /**
     * Get device-specific voltage cap (replaces simple frequency-based cap)
     */
    getDeviceVoltageCap(state, minerData) {
        return DeviceDetector.getDeviceVoltageCap(state, minerData, CONFIG.AUTOTUNE[state.mode]);
    }

    calculateDailyCost(powerW, kwhPrice) {
        return TuningLogic.calculateDailyCost(powerW, kwhPrice);
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

        // Reset adaptive limits if mode changed
        if (state.lastMode && state.lastMode !== state.mode) {
            console.log(`[AutoTune] ${ip}: Mode changed from ${state.lastMode} to ${state.mode}. Resetting limits.`);
            state.adaptiveLimits = null;
        }
        state.lastMode = state.mode;

        try {
            // Fetch miner data
            const resp = await fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(3000) });
            if (!resp.ok) return;

            const data = await resp.json();
            const temp = parseFloat(data.temp);
            const sharesAccepted = parseInt(data.sharesAccepted) || 0;
            const sharesRejected = parseInt(data.sharesRejected) || 0;
            const hashrate = parseFloat(data.hashRate || data.hashrate) || 0;
            const expectedHashrate = parseFloat(data.expectedHashrate) || 0;
            const power = parseFloat(data.power) || 0;

            let currentHWErrorCount = state.deviceType === 'NerdQAxe' ? 0 : data.hashrateMonitor?.asics?.[0]?.errorCount || 0;

            // Calculate HW Error Rate (Delta)
            let hwErrorDelta = 0;
            if (currentHWErrorCount < state.lastErrorCount) {
                state.lastErrorCount = currentHWErrorCount; // Reset if miner restarted
            } else {
                hwErrorDelta = currentHWErrorCount - (state.lastErrorCount || 0);
            }

            // Calculate Error Rate (HW Errors / Expected Shares or just Time)
            // For most devices, we want to IGNORE share-based error rate (pool rejects) for tuning purposes.
            // We only care about HW stability. 
            // - NerdQAxe uses effective hashrate deviation (calculated below).
            // - Other devices rely on `hwErrorDelta` which is checked separately in the tuning logic.
            // Therefore, default currentErrorRate to 0 to avoid false positives from pool rejects.
            let currentErrorRate = 0;

            // If a specific device reports a reliable HW-based error % in the API, we use it here.
            // USER CONFIRMED: This applies to ALL devices EXCEPT NerdQAxe (which needs calculated rate).
            if (state.deviceType !== 'NerdQAxe' && data.errorPercentage !== undefined) {
                currentErrorRate = data.errorPercentage / 100;
            }

            // Override with NerdQAxe calculated rate if applicable

            // Override with NerdQAxe calculated rate if applicable
            if (state.deviceType === 'NerdQAxe') {
                const chipCount = data.asicCount || 1;
                const expectedHash = (state.currentFreq * chipCount * 2.01);
                if (expectedHash > 0) {
                    // Add 2% tolerance buffer. If we are within 2% of expected, count as 0% error.
                    // This prevents aggressive mode (1% limit) from throttling a 99% performer.
                    const tolerance = 0.02;
                    const rawErrorRate = 1.0 - (hashrate / expectedHash);
                    const effectiveErrorRate = Math.max(0, rawErrorRate - tolerance);

                    // use effective rate if significant, essentially treating missing hashrate as errors
                    currentErrorRate = effectiveErrorRate;
                }
            }

            // Smooth the error rate
            const smoothFactors = { aggressive: 0.1, cost_sensitive: 0.05, conservative: 0.02 };
            const alpha = smoothFactors[state.mode] || 0.05;
            // Initialize if needed
            if (state.errorRate === undefined) state.errorRate = currentErrorRate;
            state.errorRate = (alpha * currentErrorRate) + ((1 - alpha) * state.errorRate);
            const smoothErrorRate = state.errorRate;

            const vrTemp = parseFloat(data.vrTemp) || 0;
            const inputVolts = parseFloat(data.voltage) || 0;

            // Updated Hashrate Performance Logic:
            // Use Hashrate/Frequency ratio (Expected Efficiency) to handle frequency scaling correctly.
            // This prevents false "Low Hashrate" faults when running at low frequencies where API expectedHashrate might be static/high.

            const currentHashPerMHz = state.currentFreq > 0 ? (hashrate / state.currentFreq) : 0;

            // Maintain a smoothed Baseline Hash/MHz
            state.baselineHashPerMHz = state.baselineHashPerMHz || currentHashPerMHz;

            // Only update baseline if performance is "good" relative to itself (e.g. not crashing)
            // Or slowly adapt (alpha = 0.05) to drift
            if (currentHashPerMHz > 0.1) { // Basic sanity check
                state.baselineHashPerMHz = (0.05 * currentHashPerMHz) + (0.95 * state.baselineHashPerMHz);
            }

            // Calculate Performance % based on dynamic baseline OR static expected if baseline is cold
            // If API expectedHashrate is wildly different (>2x) from current, trust our baseline

            let hashPerformance = 1.0;

            if (expectedHashrate > 0) {
                // Check if API expected is consistent with current freq (e.g. within 50%)
                // If API says 2000GH but at 700MHz we only get 1200GH, ratio is 0.6.
                // We want to detect if CHIPS are failing, not if FREQ is low.
                // So we compare current Hash/MHz to Baseline Hash/MHz.

                if (state.baselineHashPerMHz > 0.1) {
                    hashPerformance = currentHashPerMHz / state.baselineHashPerMHz;
                } else {
                    // Fallback to API expected if we have no history (startup)
                    // Be lenient at startup
                    hashPerformance = hashrate / expectedHashrate;
                }
            }

            // Override for NerdQAxe (uses calculated expected)
            if (state.deviceType === 'NerdQAxe') {
                // Recalculate based on 2.01 coeff
                const expectedHash = (state.currentFreq * (data.asicCount || 1) * 2.01);
                if (expectedHash > 0) hashPerformance = hashrate / expectedHash;
            }

            // Cost Calculations
            const isCostSensitive = state.mode === 'cost_sensitive';
            const currentDailyCost = this.calculateDailyCost(power, state.kwhPrice);

            // Moving averages - Temp
            state.tempHistory = state.tempHistory || [];
            state.tempHistory.push(temp);
            if (state.tempHistory.length > 5) state.tempHistory.shift();
            const avgTemp = state.tempHistory.reduce((a, b) => a + b, 0) / state.tempHistory.length;

            // Error Rate smoothing (Exponential Moving Average is already used in state.errorRate above)
            // We update errorHistory for display/charting purposes if needed, but use state.errorRate for control.
            state.errorHistory = state.errorHistory || [];
            state.errorHistory.push(currentErrorRate);
            if (state.errorHistory.length > 5) state.errorHistory.shift();
            // const smoothErrorRate = ... (Already defined above as alpha-smoothed value)

            // Sync with actual miner state
            // If the reported voltage is close to our last set voltage (within rounding error), 
            // keep our high-precision value instead of the miner's rounded integer.
            if (Math.abs((data.coreVoltage || 0) - (state.currentVoltage || 0)) > 1.5) {
                state.currentVoltage = data.coreVoltage;
            }
            state.currentFreq = data.frequency;

            // --- HISTORY LOGGING ---
            state.tuningLog = state.tuningLog || [];

            // GRID HISTORY AGGREGATION
            // Create a key for this voltage/freq combo
            state.gridHistory = state.gridHistory || {};
            const gridKey = `${state.currentVoltage}_${state.currentFreq}`;

            // Only update grid history if we have valid non-zero data
            if (hashrate > 0 && power > 0) {
                const existing = state.gridHistory[gridKey] || {
                    cnt: 0,
                    v: state.currentVoltage,
                    f: state.currentFreq,
                    th: 0, // Total Hash
                    te: 0, // Total Eff
                    tt: 0, // Total Temp
                    mh: 0, // Max Hash
                    me: 9999, // Best Eff (Min)
                    mt: 999, // Min Temp
                    l: 0   // Last Seen TS
                };

                existing.cnt++;
                existing.th += hashrate;
                let currentEff = power / (hashrate / 1000);
                existing.te += currentEff;
                existing.tt += temp;

                existing.mh = Math.max(existing.mh, hashrate);
                existing.me = Math.min(existing.me, currentEff);
                existing.mt = Math.min(existing.mt, temp);
                existing.l = now;

                state.gridHistory[gridKey] = existing;
            }

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
            // Limit log size (10000 entries ~ 24h+ depending on interval)
            if (state.tuningLog.length > 10000) {
                state.tuningLog.shift();
            }


            // NEW: Detect ASIC model and device type (once)
            if (data.boardVersion && !state.boardVersion) {
                state.boardVersion = data.boardVersion;
            }

            if (!state.asicModel) {
                state.asicModel = this.detectASICModel(data);
                console.log(`[AutoTune] ${ip}: Detected ASIC model: ${state.asicModel || 'Unknown'}`);
            }
            if (!state.deviceType) {
                // DEBUG: Log all API data for device detection (Sanitized)
                const sanitizedData = { ...data };
                const sensitiveKeys = ['ssid', 'wifiStatus', 'wifiRSSI', 'macAddr', 'stratumUser', 'fallbackStratumUser', 'wifiPassword'];
                sensitiveKeys.forEach(k => { if (sanitizedData[k]) sanitizedData[k] = '***'; });

                console.log(`[AutoTune Debug] ${ip}: API Data for detection:`, JSON.stringify(sanitizedData));

                state.deviceType = this.detectDeviceType(data);
                const deviceLimits = DEVICE_VOLTAGE_LIMITS[state.deviceType] || DEVICE_VOLTAGE_LIMITS['5V']; // Fallback fix
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

            // === FAULT DETECTION ===
            const metrics = {
                hashrate, expectedHashrate, power, vrTemp, inputVolts, temp, currentHWErrorCount
            };
            const faults = FaultDetector.detect(data, state, config, metrics);
            // Explicitly assign to avoid destructuring/ReferenceError confusion
            const isCriticalFault = faults.isCriticalFault;
            const isSoftFault = faults.isSoftFault;
            const reasons = faults.reasons;
            const isTempGlitch = faults.isTempGlitch;
            const tempDrop = faults.tempDrop;
            const isVrTooHot = faults.isVrTooHot;
            const isPowerTooHigh = faults.isPowerTooHigh;

            // Debug logging to verify variables are defined
            // console.log(`[AutoTune Debug] Faults:`, { isCriticalFault, isSoftFault, isVrTooHot });
            if (isTempGlitch) {
                state.lastSeenTemp = temp;
            }
            state.lastSeenTemp = temp;


            // === CRITICAL FAULT HANDLING (Priority 1) ===
            if (isCriticalFault) {
                state.faultCounter = (state.faultCounter || 0) + 1;

                if (state.faultCounter >= 3 && !state.restarting && now > state.stabilizationUntil) {
                    // Learn adaptive limits
                    const faultVoltage = state.currentVoltage;
                    const faultFreq = state.currentFreq;

                    state.adaptiveLimits = state.adaptiveLimits || {
                        maxVoltage: freqVoltageCap,
                        maxFreq: config.maxFreq
                    };

                    const safetyMarginV = config.voltageStep * 2;
                    const safetyMarginF = config.freqStep;

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

                    // Recover to learned limits minus 5 steps to avoid long ramp up
                    // Ensure we don't go below minFreq
                    targetFreq = Math.max(config.minFreq, state.adaptiveLimits.maxFreq - (config.freqStep * 5));

                    if (state.asicModel) {
                        targetVoltage = this.getRecommendedVoltage(targetFreq, state.asicModel, state.deviceType) ||
                            Math.max(config.minVoltage, state.adaptiveLimits.maxVoltage - (config.voltageStep * 5));
                        console.log(`[AutoTune] ${ip}: Using PLL recovery: ${targetVoltage}mV for ${targetFreq}MHz (Limit - 5 steps)`);
                    } else {
                        targetVoltage = Math.max(config.minVoltage, state.adaptiveLimits.maxVoltage - (config.voltageStep * 5));
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
                // Confirm variable scope availability
                console.log(`[AutoTune Debug] Soft Fault Check: isVrTooHot=${isVrTooHot}, isPowerTooHigh=${isPowerTooHigh}`);

                const softReasons = [];
                if (isVrTooHot) softReasons.push(`VR_HOT(${vrTemp}C)`);
                if (isPowerTooHigh) softReasons.push(`POWER_LIMIT(${power}W)`);

                if (newFreq === config.minFreq) {
                    newVoltage = Math.max(config.minVoltage, state.currentVoltage - config.voltageStep);
                }
                action = isVrTooHot ? 'VR_TEMP_THROTTLE' : 'POWER_LIMIT_THROTTLE';

                console.warn(`[AutoTune] ${ip}: SOFT FAULT! Reason: ${softReasons.join(', ')}. Throttling to ${newVoltage}mV/${newFreq}MHz...`);
                state.stableCycleCount = 0;
            }
            // Dynamic Input Voltage Limits
            const inputLimits = INPUT_VOLTAGE_LIMITS[state.deviceType] || INPUT_VOLTAGE_LIMITS['5V'];
            // If inputVolts is reported in Volts (e.g. 12.0), convert to mV for comparison if limits are in mV
            // However, the API seems to return mV for voltage (5046.875).
            const isInputVoltsOutOfRange = inputVolts > 0 && (inputVolts < inputLimits.min || inputVolts > inputLimits.max);

            // Debug Logging (Unconditional)
            if (hashrate > 0) {
                const globalSpeed = (state.currentFreq / config.maxFreq) * 100;
                console.log(`[AutoTune Debug] ${ip} Loop Variables:
                 Temp: ${avgTemp.toFixed(1)} / ${config.tempTarget}
                 Err: ${(smoothErrorRate * 100).toFixed(4)}% / ${(config.maxErrorRate * 100).toFixed(2)}%
                 HW Delta: ${hwErrorDelta} (Aggressive Threshold: ${state.mode === 'aggressive' ? 100 : 20})
                 Health: ${(hashPerformance * 100).toFixed(1)}% / 90.0%
                 Global Speed: ${globalSpeed.toFixed(1)}% (${state.currentFreq}/${config.maxFreq}MHz)
                 Volts: ${inputVolts}mV (Range: ${inputLimits.min}-${inputLimits.max})
                 Power: ${power.toFixed(1)}W / ${config.maxWatts}W`);
            }

            // === PRIORITY 4: THERMAL DANGER ===
            if (avgTemp >= config.tempDanger) {
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
                hwErrorDelta > (state.mode === 'aggressive' ? 100 : 20) ||
                hashPerformance < 0.90) {

                console.log(`[AutoTune Debug] ${ip} Stability Trigger: Err=${smoothErrorRate.toFixed(6)} > Max=${config.maxErrorRate}, HW=${hwErrorDelta} > ${state.mode === 'aggressive' ? 100 : 20}, Perf=${hashPerformance.toFixed(3)} < 0.90`);

                const isHighError = smoothErrorRate > config.maxErrorRate;
                const isLowHash = hashPerformance < 0.90; // Relaxed from 0.94 to avoids false positives with noise

                const failedOptimization = ['voltage_pullback_optimization', 'tune_for_efficiency'].includes(state.lastAction);

                if (failedOptimization) {
                    newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                    action = 'instability_revert_optimization';
                } else if (isHighError || hwErrorDelta > 100) {
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
                // Use per-unit adaptive limits if they exist (Restored legacy logic)
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

                // Debug Optimization Logic
                if (state.stableCycleCount > 5) {
                    console.log(`[AutoTune Debug] ${ip} Opt Check: Headroom=${hasFreqHeadroom} (Max: ${effectiveMaxFreq}), Stable=${isStable}, Eff=${efficiency ? efficiency.toFixed(1) : 'N/A'} (Target: ${config.targetEfficiency || 'N/A'})`);
                }

                // Priority 10: Voltage pullback
                // If we are at max voltage/freq and stable, try to back off voltage to save power/heat
                if (newVoltage === effectiveMaxVoltage && isVeryStable && !hasFreqHeadroom) {
                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                    action = 'voltage_pullback_optimization';
                    state.stableCycleCount = 0;
                }
                // Priority 8: Efficiency tuning
                else if (efficiency !== null && config.targetEfficiency && efficiency > config.targetEfficiency + 0.5) {
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
            }

            // Apply Changes
            if (newVoltage !== state.currentVoltage || newFreq !== state.currentFreq) {
                state.lastAction = action;
                state.lastAdjustment = now;
                const pllIndicator = action.includes('pll') ? ' [PLL]' : '';
                console.log(`[AutoTune] ${ip}: ${state.currentVoltage}mV/${state.currentFreq}MHz -> ${newVoltage}mV/${newFreq}MHz (Action: ${action}${pllIndicator}, Temp: ${temp}°C, Err: ${(smoothErrorRate * 100).toFixed(2)}%, HW: ${hwErrorDelta}, Perf: ${(hashPerformance * 100).toFixed(1)}%, Stable: ${state.stableCycleCount})`);
                await this.applySettings(ip, newVoltage, newFreq).catch(e => console.error(`[AutoTune] ${ip} Apply Error:`, e.message));

                state.currentVoltage = newVoltage;
                state.currentFreq = newFreq;
            } else {
                state.lastAction = action; // update action even if values hold

                // Increment stability counter if no changes
                if (action === 'maintain' || action.includes('optimize_')) {
                    state.stableCycleCount = (state.stableCycleCount || 0) + 1;
                }

                // Heartbeat
                // Calculate current efficiency for logging
                let efficiency = null;
                if (config.targetEfficiency && hashrate > 0 && power > 0) {
                    efficiency = power / (hashrate / 1000);
                }

                state.heartbeatCount = (state.heartbeatCount || 0) + 1;
                if (state.heartbeatCount >= 6) {
                    const effStr = efficiency !== null ? `, ${efficiency.toFixed(1)}J/TH` : '';
                    const chipStr = state.asicModel ? ` [${state.asicModel}]` : '';
                    const deviceStr = state.deviceType !== '5V' ? ` (${state.deviceType})` : '';
                    console.log(`[AutoTune] ${ip}${chipStr}${deviceStr}: ${state.currentVoltage}mV/${state.currentFreq}MHz (${temp}°C, Δ${(config.tempTarget - temp).toFixed(1)}°C, ${(smoothErrorRate * 100).toFixed(2)}%${effStr}, Stable: ${state.stableCycleCount}, ${state.mode})`);
                    state.heartbeatCount = 0;
                }
            }

            state.lastShares = { valid: sharesAccepted, invalid: sharesRejected };
            state.lastErrorCount = currentHWErrorCount;
            StorageService.saveAutoTuneState(this.autoTuneStates);

        } catch (e) {
            console.error(`[AutoTune] ${ip}: Error in loop: ${e.message}`);
        }
    }

    async applySettings(ip, voltage, freq, restart = false) {
        try {
            const state = this.autoTuneStates.get(ip);
            const deviceType = state?.deviceType || '5V';
            const boardVersion = (state?.boardVersion || '').toLowerCase();
            const deviceModel = (state?.asicModel || '').toLowerCase(); // asicModel might not be deviceModel string, check data

            // Check if NerdQAxe for integer rounding
            // Re-use detector logic? Or just check type string.
            // DetectDeviceType returns specific string now.
            const isNerdQAxe = (deviceType === 'NerdQAxe');

            let sentFreq = freq;
            let sentVoltage = voltage;

            if (isNerdQAxe) {
                sentFreq = Math.round(freq);
                sentVoltage = Math.round(voltage);
            } else {
                sentFreq = parseFloat(freq.toFixed(2));
                sentVoltage = parseFloat(voltage.toFixed(2));
            }

            console.log(`[AutoTune] ${ip}: Applying settings V=${sentVoltage} (${voltage}), F=${sentFreq} (${freq}) [Restart=${restart}]`);

            // Use PATCH /api/system for settings
            const res = await fetch(`http://${ip}/api/system`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coreVoltage: sentVoltage, frequency: sentFreq })
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text}`);
            }
            console.log(`[AutoTune] ${ip}: Settings applied successfully.`);
            if (restart) {
                console.log(`[AutoTune] ${ip}: Restarting miner...`);
                // Use POST /api/system/restart
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

        let config = CONFIG.AUTOTUNE[state.mode];
        if (!config) {
            config = CONFIG.AUTOTUNE['conservative'];
        }
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
        state.faultHistory = [];
        state.faultCounter = 0;
        state.restarting = false;
        state.stabilizationUntil = 0;

        StorageService.saveAutoTuneState(this.autoTuneStates);
        console.log(`[AutoTune] ${ip}: Adaptive limits reset to defaults.`);
        return true;
    }

    // Manually set adaptive limits
    setAdaptiveLimits(ip, maxVoltage, maxFreq) {
        const state = this.autoTuneStates.get(ip);
        if (!state) return false;

        const config = CONFIG.AUTOTUNE[state.mode];
        const deviceType = state.deviceType || '5V';
        const deviceLimits = DEVICE_VOLTAGE_LIMITS[deviceType];

        // Validate against device hardware limits (Safety check)
        if (maxVoltage < config.minVoltage || maxVoltage > deviceLimits.maxVoltage ||
            maxFreq < config.minFreq || maxFreq > deviceLimits.maxFreq) {
            console.error(`[AutoTune] ${ip}: Invalid limits. Must be within ${config.minVoltage}-${deviceLimits.maxVoltage}mV and ${config.minFreq}-${deviceLimits.maxFreq}MHz`);
            return false;
        }

        state.adaptiveLimits = state.adaptiveLimits || {};
        if (maxVoltage) state.adaptiveLimits.maxVoltage = parseInt(maxVoltage);
        if (maxFreq) state.adaptiveLimits.maxFreq = parseInt(maxFreq);

        StorageService.saveAutoTuneState(this.autoTuneStates);
        console.log(`[AutoTune] ${ip}: Manually set adaptive limits to ${maxVoltage}mV/${maxFreq}MHz`);
        return true;
    }
}

module.exports = AutoTuneEngine;