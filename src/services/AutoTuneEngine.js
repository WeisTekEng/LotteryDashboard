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
            // Logic starts here
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

            let liveErrorRate = 0;
            if (data.errorPercentage !== undefined) {
                liveErrorRate = parseFloat(data.errorPercentage) / 100;
            } else {
                const deltaValid = sharesAccepted - (state.lastShares?.valid || 0);
                const deltaInvalid = sharesRejected - (state.lastShares?.invalid || 0);
                const totalDelta = deltaValid + deltaInvalid;
                liveErrorRate = totalDelta > 0 ? deltaInvalid / totalDelta : 0;
            }

            state.tempHistory = state.tempHistory || [];
            state.tempHistory.push(temp);
            if (state.tempHistory.length > 5) state.tempHistory.shift();
            const avgTemp = state.tempHistory.reduce((a, b) => a + b, 0) / state.tempHistory.length;

            state.errorHistory = state.errorHistory || [];
            state.errorHistory.push(liveErrorRate);
            if (state.errorHistory.length > 5) state.errorHistory.shift();
            const smoothErrorRate = state.errorHistory.reduce((a, b) => a + b, 0) / state.errorHistory.length;

            // Always sync with actual miner state to detect out-of-band changes
            state.currentVoltage = data.coreVoltage;
            state.currentFreq = data.frequency;

            const freqVoltageCap = this.getFreqVoltageCap(state.currentFreq, config.maxVoltage);

            const hasApiFault = data.power_fault && data.power_fault.includes("Fault");
            const isUnderperforming = expectedHashrate > 100 && hashrate < (expectedHashrate * 0.05);
            const isFallbackFault = isUnderperforming && power < 10.0 && state.currentFreq > config.minFreq;
            const isVrTooHot = vrTemp >= config.maxVrTemp;
            const isInputVoltsOutOfRange = inputVolts > 0 && (inputVolts < config.minInputVolts || inputVolts > config.maxInputVolts);
            const isPowerTooHigh = power > config.maxWatts;

            const isFaulty = hasApiFault || isFallbackFault || isVrTooHot || isInputVoltsOutOfRange || isPowerTooHigh;

            if (isFaulty) {
                state.faultCounter = (state.faultCounter || 0) + 1;
                const reasons = [];
                if (hasApiFault) reasons.push(`API_FAULT(${data.power_fault})`);
                if (isFallbackFault) reasons.push(`FALLBACK_FAULT(${hashrate.toFixed(0)}H/${power.toFixed(1)}W)`);
                if (isVrTooHot) reasons.push(`VR_HOT(${vrTemp}C)`);
                if (isInputVoltsOutOfRange) reasons.push(`VOLTAGE_OUT_OF_RANGE(${inputVolts}mV)`);
                if (isPowerTooHigh) reasons.push(`POWER_LIMIT_EXCEEDED(${power}W)`);

                if (state.faultCounter >= 2 && !state.restarting && now > state.stabilizationUntil) {
                    const targetVoltage = state.lastGoodVoltage || config.minVoltage;
                    const targetFreq = state.lastGoodFreq || config.minFreq;

                    console.warn(`[AutoTune] ${ip}: POWER FAULT CONFIRMED! Reason: ${reasons.join(', ')}. Reverting to ${state.lastGoodVoltage ? 'last known stable' : 'safe limits'} (${targetVoltage}mV/${targetFreq}MHz) and restarting...`);

                    this.applySettings(ip, targetVoltage, targetFreq, true);
                    state.currentVoltage = targetVoltage;
                    state.currentFreq = targetFreq;
                    state.stabilizationUntil = now + 120000;
                    state.restarting = true;
                    state.lastAdjustment = now;
                    state.faultCounter = 0;
                    StorageService.saveAutoTuneState(this.autoTuneStates);
                    return;
                } else if (!state.restarting) {
                    console.log(`[AutoTune] ${ip}: Potential fault detected (${reasons.join(', ')}). Verifying in next cycle...`);
                }
            } else {
                state.faultCounter = 0;
            }

            let newVoltage = state.currentVoltage;
            let newFreq = state.currentFreq;
            let action = 'maintain';
            const isStabilizing = now < state.stabilizationUntil;

            if (state.restarting && now >= state.stabilizationUntil) {
                state.restarting = false;
                newVoltage = config.recoveryVoltage;
                newFreq = config.recoveryFreq;
                action = 'post_restart_recovery';
            } else if (temp >= 75) {
                newVoltage = config.minVoltage;
                newFreq = config.minFreq;
                action = 'EMERGENCY_COOLING';
            } else {
                const hwErrorThreshold = (state.mode === 'aggressive' || state.mode === 'Aggressive') ? 50 : 5;
                if (smoothErrorRate > config.maxErrorRate || hwErrorDelta > hwErrorThreshold || hashPerformance < 0.94) {
                    const failedOptimization = ['voltage_pullback_optimization', 'tune_for_efficiency', 'decrease_temp_warning', 'decrease_temp_aggressive'].includes(state.lastAction);
                    if (failedOptimization) {
                        newVoltage = Math.min(config.maxVoltage, state.currentVoltage + config.voltageStep);
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        action = 'instability_revert_and_throttle';
                    } else if (state.currentVoltage >= config.maxVoltage) {
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        action = 'instability_throttle_freq';
                    } else {
                        newVoltage = Math.min(config.maxVoltage, newVoltage + config.voltageStep);
                        action = 'increase_stability_voltage';
                    }
                    state.stableCycleCount = 0;
                } else if (avgTemp >= config.tempDanger) {
                    newFreq = Math.max(config.minFreq, newFreq - config.freqStep * 2);
                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                    action = 'decrease_temp_aggressive';
                    state.stableCycleCount = 0;
                } else if (avgTemp >= config.tempWarning) {
                    newFreq = Math.max(config.minFreq, newFreq - config.freqStep);
                    newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                    action = 'decrease_temp_warning';
                    state.stableCycleCount = 0;
                } else if (avgTemp < config.tempTarget) {
                    if (newVoltage === config.maxVoltage && (state.stableCycleCount || 0) >= 10 && smoothErrorRate < 0.01) {
                        newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                        action = 'voltage_pullback_optimization';
                        state.stableCycleCount = 0;
                    } else if (config.targetEfficiency && hashrate > 0) {
                        const efficiency = power / (hashrate / 1000);
                        if (efficiency > config.targetEfficiency + 0.5) {
                            newFreq = Math.max(config.minFreq, newFreq - config.freqStep);
                            newVoltage = Math.max(config.minVoltage, newVoltage - config.voltageStep);
                            action = 'tune_for_efficiency';
                            state.stableCycleCount = 0;
                        } else if (efficiency < config.targetEfficiency - 0.5 && newFreq < config.maxFreq) {
                            newFreq = Math.min(config.maxFreq, newFreq + config.freqStep);
                            action = 'increase_freq_room';
                            state.stableCycleCount = 0;
                        }
                    } else if (newFreq < config.maxFreq) {
                        const throttleCooldown = ['instability_throttle_freq', 'instability_revert_and_throttle', 'vf_curve_rebalance'].includes(state.lastAction) ? 10 : 2;
                        const isApproachingTarget = temp > (config.tempTarget - 2);
                        if ((state.stableCycleCount || 0) >= throttleCooldown && !isApproachingTarget) {
                            newFreq = Math.min(config.maxFreq, newFreq + config.freqStep);
                            action = 'increase_freq';
                            state.stableCycleCount = 0;
                        } else {
                            action = 'maintain';
                        }
                    }
                }
            }

            if (action === 'maintain' || action === 'stabilizing') {
                state.stableCycleCount = (state.stableCycleCount || 0) + 1;

                // Track "Last Known Good" version
                // Require at least 20 stable cycles (approx 3.5 mins) and very low error
                if (state.stableCycleCount >= 20 && smoothErrorRate < 0.01) {
                    if (state.lastGoodVoltage !== state.currentVoltage || state.lastGoodFreq !== state.currentFreq) {
                        state.lastGoodVoltage = state.currentVoltage;
                        state.lastGoodFreq = state.currentFreq;
                        console.log(`[AutoTune] ${ip}: Recorded new 'Last Known Good' state: ${state.lastGoodVoltage}mV/${state.lastGoodFreq}MHz`);
                        StorageService.saveAutoTuneState(this.autoTuneStates);
                    }
                }
            }

            if (isStabilizing && !['EMERGENCY_COOLING', 'decrease_temp_warning', 'decrease_temp_aggressive'].includes(action)) {
                if (newFreq > state.currentFreq || newVoltage > state.currentVoltage) {
                    newFreq = state.currentFreq;
                    newVoltage = state.currentVoltage;
                    action = 'stabilizing';
                }
            }

            const nextVoltageCap = this.getFreqVoltageCap(newFreq, config.maxVoltage);
            if (newVoltage > nextVoltageCap) {
                if (action === 'increase_stability_voltage' || action === 'instability_revert_and_throttle') {
                    if (state.currentVoltage < nextVoltageCap) {
                        newVoltage = nextVoltageCap;
                    } else if (state.currentFreq > config.minFreq) {
                        newFreq = Math.max(config.minFreq, state.currentFreq - config.freqStep);
                        newVoltage = Math.min(nextVoltageCap, this.getFreqVoltageCap(newFreq, config.maxVoltage));
                        action = 'instability_throttle_freq';
                    } else {
                        newVoltage = nextVoltageCap;
                        action = 'maintain';
                    }
                } else if (action !== 'EMERGENCY_COOLING' && !action.includes('decrease_temp')) {
                    action = 'vf_curve_rebalance';
                    newVoltage = nextVoltageCap;
                } else {
                    newVoltage = nextVoltageCap;
                }
            }

            state.lastShares = { valid: sharesAccepted, invalid: sharesRejected };
            state.lastErrorCount = currentHWErrorCount;
            state.lastAction = action;
            StorageService.saveAutoTuneState(this.autoTuneStates);

            if (newVoltage !== state.currentVoltage || newFreq !== state.currentFreq) {
                console.log(`[AutoTune] ${ip}: Adjusting ${state.currentVoltage}mV/${state.currentFreq}MHz -> ${newVoltage}mV/${newFreq}MHz (Action: ${action}, Temp: ${temp}°C, Error: ${(smoothErrorRate * 100).toFixed(2)}%)`);
                this.applySettings(ip, newVoltage, newFreq).catch(e => console.error(`[AutoTune] ${ip} Apply Error:`, e.message));
                state.currentVoltage = newVoltage;
                state.currentFreq = newFreq;
                state.lastAdjustment = now;
                StorageService.saveAutoTuneState(this.autoTuneStates);
            } else {
                // Heartbeat log every 6 cycles (approx 1 minute with 10s loop)
                state.heartbeatCount = (state.heartbeatCount || 0) + 1;
                if (state.heartbeatCount >= 6) {
                    console.log(`[AutoTune] ${ip}: Status - ${state.currentVoltage}mV/${state.currentFreq}MHz (Temp: ${temp}°C, Error: ${(smoothErrorRate * 100).toFixed(2)}%, Mode: ${state.mode})`);
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
}

module.exports = AutoTuneEngine;
