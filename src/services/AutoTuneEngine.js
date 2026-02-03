const CONFIG = require('../config');
const StorageService = require('./StorageService');

class AutoTuneEngine {
    constructor(autoTuneStates) {
        this.autoTuneStates = autoTuneStates || new Map();
    }

    getFreqVoltageCap(freq, maxVoltage) {
        if (freq < 500) return 1200;
        return maxVoltage;
    }

    async run(ip) {
        const state = this.autoTuneStates.get(ip);
        if (!state || !state.enabled) return;

        const config = CONFIG.AUTOTUNE[state.mode];
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

            // Moving averages for stability
            state.tempHistory = state.tempHistory || [];
            state.tempHistory.push(temp);
            if (state.tempHistory.length > 5) state.tempHistory.shift();
            const avgTemp = state.tempHistory.reduce((a, b) => a + b, 0) / state.tempHistory.length;

            state.errorHistory = state.errorHistory || [];
            state.errorHistory.push(liveErrorRate);
            if (state.errorHistory.length > 5) state.errorHistory.shift();
            const smoothErrorRate = state.errorHistory.reduce((a, b) => a + b, 0) / state.errorHistory.length;

            // Sync with actual miner state
            state.currentVoltage = data.coreVoltage;
            state.currentFreq = data.frequency;

            const freqVoltageCap = this.getFreqVoltageCap(state.currentFreq, config.maxVoltage);

            // Calculate current efficiency (needed for logging and optimization)
            let efficiency = null;
            if (config.targetEfficiency && hashrate > 0 && power > 0) {
                efficiency = power / (hashrate / 1000); // J/TH
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
                    // NEW: Learn from faults and set per-unit adaptive limits
                    const faultVoltage = state.currentVoltage;
                    const faultFreq = state.currentFreq;

                    // Initialize adaptive limits if not present
                    state.adaptiveLimits = state.adaptiveLimits || {
                        maxVoltage: config.maxVoltage,
                        maxFreq: config.maxFreq,
                        faultHistory: []
                    };

                    // Record this fault with a safety margin
                    const safetyMarginV = config.voltageStep * 2; // 20-30mV safety margin
                    const safetyMarginF = config.freqStep * 3;    // 30MHz safety margin

                    const newMaxVoltage = Math.max(config.minVoltage, faultVoltage - safetyMarginV);
                    const newMaxFreq = Math.max(config.minFreq, faultFreq - safetyMarginF);

                    // Only reduce limits if this fault is higher than previous known limits
                    const voltageReduced = newMaxVoltage < state.adaptiveLimits.maxVoltage;
                    const freqReduced = newMaxFreq < state.adaptiveLimits.maxFreq;

                    if (voltageReduced || freqReduced) {
                        state.adaptiveLimits.maxVoltage = Math.min(state.adaptiveLimits.maxVoltage, newMaxVoltage);
                        state.adaptiveLimits.maxFreq = Math.min(state.adaptiveLimits.maxFreq, newMaxFreq);

                        // Track fault history (keep last 10)
                        state.adaptiveLimits.faultHistory.push({
                            timestamp: now,
                            voltage: faultVoltage,
                            freq: faultFreq,
                            reason: reasons.join(', '),
                            newLimits: {
                                maxVoltage: state.adaptiveLimits.maxVoltage,
                                maxFreq: state.adaptiveLimits.maxFreq
                            }
                        });
                        if (state.adaptiveLimits.faultHistory.length > 10) {
                            state.adaptiveLimits.faultHistory.shift();
                        }

                        console.warn(`[AutoTune] ${ip}: LEARNED FROM FAULT! Reducing limits: V=${config.maxVoltage}mV→${state.adaptiveLimits.maxVoltage}mV, F=${config.maxFreq}MHz→${state.adaptiveLimits.maxFreq}MHz (Fault was at ${faultVoltage}mV/${faultFreq}MHz)`);
                    }

                    // Use conservative fallback for recovery
                    const targetVoltage = Math.min(config.minVoltage + (config.voltageStep * 5), state.adaptiveLimits.maxVoltage);
                    const targetFreq = Math.min(config.minFreq + (config.freqStep * 10), state.adaptiveLimits.maxFreq);

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
                newVoltage = config.recoveryVoltage;
                newFreq = config.recoveryFreq;
                action = 'post_restart_recovery';
                state.stableCycleCount = 0;
            }
            // === PRIORITY 2: EMERGENCY COOLING (Core Temp ≥ 75°C) ===
            else if (temp >= 75) {
                newVoltage = config.minVoltage;
                newFreq = config.minFreq;
                action = 'EMERGENCY_COOLING';
                state.stableCycleCount = 0;
            }
            // === PRIORITY 3: SOFT FAULT (VRM or Power) ===
            else if (isSoftFault && !state.restarting && now > state.stabilizationUntil) {
                const softReasons = [];
                if (isVrTooHot) softReasons.push(`VR_HOT(${vrTemp}C)`);
                if (isPowerTooHigh) softReasons.push(`POWER_LIMIT(${power}W)`);

                // NEW: Try frequency reduction FIRST before touching voltage
                newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep * 2);
                // Only reduce voltage if frequency is already at minimum
                if (newFreq === config.minFreq) {
                    newVoltage = Math.max(config.minVoltage, state.currentVoltage - config.voltageStep);
                }
                action = isVrTooHot ? 'VR_TEMP_THROTTLE' : 'POWER_LIMIT_THROTTLE';

                console.warn(`[AutoTune] ${ip}: SOFT FAULT! Reason: ${softReasons.join(', ')}. Throttling to ${newVoltage}mV/${newFreq}MHz...`);
                state.stableCycleCount = 0;
            }
            // === PRIORITY 4: THERMAL DANGER (Temp ≥ 72°C) ===
            else if (avgTemp >= config.tempDanger) {
                // NEW: Prioritize frequency reduction over voltage
                newFreq = Math.max(config.minFreq, newFreq - config.freqStep * 2);
                // Only reduce voltage if we still need more cooling
                if (newFreq > config.minFreq || state.currentVoltage > config.minVoltage + config.voltageStep) {
                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                }
                action = 'decrease_temp_aggressive';
                state.stableCycleCount = 0;
            }
            // === PRIORITY 5: THERMAL WARNING (Temp ≥ 68°C) ===
            else if (avgTemp >= config.tempWarning) {
                // NEW: Frequency-first approach
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

                // NEW: More nuanced stability handling
                const isHighError = smoothErrorRate > config.maxErrorRate;
                const isLowHash = hashPerformance < 0.94;

                // If we just tried to optimize and it failed, be more aggressive
                const failedOptimization = ['voltage_pullback_optimization', 'tune_for_efficiency'].includes(state.lastAction);

                if (failedOptimization) {
                    // Revert optimization attempt
                    newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                    action = 'instability_revert_optimization';
                } else if (isHighError || hwErrorDelta > 20) {
                    // Significant instability: reduce frequency OR increase voltage (not both)
                    // NEW: Prefer frequency reduction if we have headroom
                    if (state.currentFreq > config.minFreq + (config.freqStep * 5)) {
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        action = 'instability_throttle_freq';
                    } else if (state.currentVoltage < freqVoltageCap) {
                        // Only increase voltage if frequency is already quite low
                        newVoltage = Math.min(freqVoltageCap, newVoltage + config.voltageStep);
                        action = 'increase_stability_voltage';
                    } else {
                        // Both are at limits, reduce frequency further
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        action = 'instability_throttle_freq';
                    }
                } else if (isLowHash) {
                    // Hash performance issue: try small voltage bump first
                    if (state.currentVoltage < freqVoltageCap - config.voltageStep) {
                        newVoltage = Math.min(freqVoltageCap, newVoltage + config.voltageStep);
                        action = 'hashrate_stability_boost';
                    } else {
                        // Voltage at cap, reduce frequency
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        action = 'hashrate_throttle';
                    }
                }
                state.stableCycleCount = 0;
            }
            // === PRIORITY 7-10: OPTIMIZATION (Temp < Target) ===
            else if (avgTemp < config.tempTarget) {
                // We have thermal headroom - can optimize

                // NEW: Use per-unit adaptive limits if they exist
                state.adaptiveLimits = state.adaptiveLimits || {
                    maxVoltage: config.maxVoltage,
                    maxFreq: config.maxFreq,
                    faultHistory: []
                };
                const effectiveMaxVoltage = state.adaptiveLimits.maxVoltage;
                const effectiveMaxFreq = state.adaptiveLimits.maxFreq;

                // NEW: Frequency-first optimization strategy
                const hasFreqHeadroom = newFreq < effectiveMaxFreq;
                const hasVoltageHeadroom = newVoltage < effectiveMaxVoltage;
                const isVeryStable = (state.stableCycleCount || 0) >= 10 && smoothErrorRate < 0.01;
                const isStable = (state.stableCycleCount || 0) >= 5 && smoothErrorRate < 0.02;

                // Priority 10: Voltage pullback optimization (only if highly stable AND at max voltage)
                if (newVoltage === effectiveMaxVoltage && isVeryStable && !hasFreqHeadroom) {
                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                    action = 'voltage_pullback_optimization';
                    state.stableCycleCount = 0;
                }
                // Priority 8: Efficiency tuning (if configured)
                else if (efficiency !== null && efficiency > config.targetEfficiency + 0.5) {
                    // Inefficient: reduce both (but bias toward frequency reduction)
                    newFreq = Math.max(config.minFreq, newFreq - config.freqStep);
                    if (newFreq === config.minFreq) {
                        newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                    }
                    action = 'tune_for_efficiency';
                    state.stableCycleCount = 0;
                }
                // Priority 9: Efficiency headroom (increase frequency)
                else if (efficiency !== null && efficiency < config.targetEfficiency - 0.5 && hasFreqHeadroom) {
                    newFreq = Math.min(effectiveMaxFreq, newFreq + config.freqStep);
                    action = 'increase_freq_efficiency';
                    state.stableCycleCount = 0;
                }
                // Priority 7: Standard frequency increase (main optimization path)
                else if (hasFreqHeadroom) {
                    // NEW: Relaxed cooldown logic
                    const recentThrottle = ['instability_throttle_freq', 'instability_revert_optimization'].includes(state.lastAction);
                    const cooldownNeeded = recentThrottle ? 5 : 2;
                    const tempMargin = config.tempTarget - avgTemp;

                    // Allow increase if stable enough AND we have good temperature margin
                    if (isStable && (state.stableCycleCount >= cooldownNeeded) && tempMargin > 3) {
                        // NEW: Scale frequency increase based on temperature margin
                        const isApproachingTarget = tempMargin < 5;
                        const freqIncrease = isApproachingTarget ? config.freqStep : config.freqStep * 1.5;

                        newFreq = Math.min(effectiveMaxFreq, newFreq + Math.floor(freqIncrease));
                        action = 'increase_freq';
                        state.stableCycleCount = 0;

                        // NEW: If we're increasing frequency and voltage is above minimum + buffer, try reducing voltage
                        if (newVoltage > config.minVoltage + (config.voltageStep * 3) && isVeryStable) {
                            newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                            action = 'increase_freq_reduce_voltage';
                        }
                    } else {
                        action = 'maintain';
                    }
                }
                // No headroom for frequency, try voltage optimization if stable
                else if (hasVoltageHeadroom && avgTemp < config.tempTarget - 3 && isVeryStable) {
                    // This is rare but can help if we're thermally limited
                    action = 'maintain';
                } else {
                    action = 'maintain';
                }
            }

            // Track stability
            if (action === 'maintain' || action === 'stabilizing') {
                state.stableCycleCount = (state.stableCycleCount || 0) + 1;

                // NEW: Track "Last Known Good" only for truly optimal states
                // Require 30 stable cycles (5 minutes), very low error, and high frequency
                // Use adaptive limits if available
                state.adaptiveLimits = state.adaptiveLimits || {
                    maxVoltage: config.maxVoltage,
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

            // Respect stabilization period (except for critical thermal events)
            if (isStabilizing && !['EMERGENCY_COOLING', 'decrease_temp_warning', 'decrease_temp_aggressive'].includes(action)) {
                if (newFreq > state.currentFreq || newVoltage > state.currentVoltage) {
                    newFreq = state.currentFreq;
                    newVoltage = state.currentVoltage;
                    action = 'stabilizing';
                }
            }

            // Apply voltage cap based on frequency
            const nextVoltageCap = this.getFreqVoltageCap(newFreq, config.maxVoltage);
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

            // Apply changes if needed
            if (newVoltage !== state.currentVoltage || newFreq !== state.currentFreq) {
                console.log(`[AutoTune] ${ip}: ${state.currentVoltage}mV/${state.currentFreq}MHz -> ${newVoltage}mV/${newFreq}MHz (Action: ${action}, Temp: ${temp}°C, Margin: ${(config.tempTarget - temp).toFixed(1)}°C, Error: ${(smoothErrorRate * 100).toFixed(2)}%, Stable: ${state.stableCycleCount})`);
                this.applySettings(ip, newVoltage, newFreq).catch(e => console.error(`[AutoTune] ${ip} Apply Error:`, e.message));
                state.currentVoltage = newVoltage;
                state.currentFreq = newFreq;
                state.lastAdjustment = now;
                StorageService.saveAutoTuneState(this.autoTuneStates);
            } else {
                // Heartbeat every 6 cycles (~1 minute)
                state.heartbeatCount = (state.heartbeatCount || 0) + 1;
                if (state.heartbeatCount >= 6) {
                    const effStr = efficiency !== null ? `, ${efficiency.toFixed(1)}J/TH` : '';
                    console.log(`[AutoTune] ${ip}: ${state.currentVoltage}mV/${state.currentFreq}MHz (${temp}°C, Δ${(config.tempTarget - temp).toFixed(1)}°C, ${(smoothErrorRate * 100).toFixed(2)}%${effStr}, Stable: ${state.stableCycleCount}, ${state.mode})`);
                    state.heartbeatCount = 0;
                }
            }
        } catch (e) {
            console.error(`[AutoTune] ${ip} check error:`, e.message);
        }
    }

    async applySettings(ip, voltage, freq, restart = false) {
        console.log(`[AutoTune] ${ip}: Sending command -> ${voltage}mV, ${freq}MHz`);
        try {
            const res = await fetch(`http://${ip}/api/system`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coreVoltage: voltage, frequency: freq })
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

        return {
            adaptiveLimits: state.adaptiveLimits || {
                maxVoltage: CONFIG.AUTOTUNE[state.mode]?.maxVoltage,
                maxFreq: CONFIG.AUTOTUNE[state.mode]?.maxFreq,
                faultHistory: []
            },
            configLimits: {
                maxVoltage: CONFIG.AUTOTUNE[state.mode]?.maxVoltage,
                maxFreq: CONFIG.AUTOTUNE[state.mode]?.maxFreq
            }
        };
    }

    // Reset adaptive limits to config defaults
    resetAdaptiveLimits(ip) {
        const state = this.autoTuneStates.get(ip);
        if (!state) return false;

        const config = CONFIG.AUTOTUNE[state.mode];
        state.adaptiveLimits = {
            maxVoltage: config.maxVoltage,
            maxFreq: config.maxFreq,
            faultHistory: []
        };

        console.log(`[AutoTune] ${ip}: Reset adaptive limits to config defaults (${config.maxVoltage}mV/${config.maxFreq}MHz)`);
        StorageService.saveAutoTuneState(this.autoTuneStates);
        return true;
    }

    // Manually set adaptive limits (useful for known problematic units)
    setAdaptiveLimits(ip, maxVoltage, maxFreq) {
        const state = this.autoTuneStates.get(ip);
        if (!state) return false;

        const config = CONFIG.AUTOTUNE[state.mode];

        // Validate limits
        if (maxVoltage < config.minVoltage || maxVoltage > config.maxVoltage ||
            maxFreq < config.minFreq || maxFreq > config.maxFreq) {
            console.error(`[AutoTune] ${ip}: Invalid limits. Must be within ${config.minVoltage}-${config.maxVoltage}mV and ${config.minFreq}-${config.maxFreq}MHz`);
            return false;
        }

        state.adaptiveLimits = state.adaptiveLimits || { faultHistory: [] };
        state.adaptiveLimits.maxVoltage = maxVoltage;
        state.adaptiveLimits.maxFreq = maxFreq;

        console.log(`[AutoTune] ${ip}: Manually set adaptive limits to ${maxVoltage}mV/${maxFreq}MHz`);
        StorageService.saveAutoTuneState(this.autoTuneStates);
        return true;
    }
}

module.exports = AutoTuneEngine;