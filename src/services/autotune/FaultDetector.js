const { INPUT_VOLTAGE_LIMITS } = require('./AutoTuneConstants');

class FaultDetector {
    /**
     * Detect faults based on miner data and configuration
     * returns { isCriticalFault, isSoftFault, reasons, tempDrop, isTempGlitch }
     */
    static detect(data, state, config, metrics) {
        const {
            hashrate,
            expectedHashrate,
            power,
            vrTemp,
            inputVolts,
            temp,
            currentHWErrorCount
        } = metrics;

        const now = Date.now();
        const reasons = [];

        // --- 1. Temperature Glitch Detection ---
        const lastTemp = state.lastSeenTemp || temp;
        const tempDrop = lastTemp - temp;
        const isTempGlitch = tempDrop > 25 && temp < 40;

        // --- 2. Input Voltage Limits ---
        // Dynamic Input Voltage Limits
        const inputLimits = INPUT_VOLTAGE_LIMITS[state.deviceType] || INPUT_VOLTAGE_LIMITS['5V'];
        // InputVolts read from data.voltage (e.g., 5046) -> that is mV.
        const isInputVoltsOutOfRange = inputVolts > 0 && (inputVolts < inputLimits.min || inputVolts > inputLimits.max);

        // --- 3. Fault Condition Checks ---

        // A. Standard API Fault (AxeOS)
        const hasApiFault = data.power_fault && data.power_fault.includes("Fault");

        // B. NerdQAxe Inference (ESP-Miner)
        let isNerdQAxeFault = false;
        if (state.deviceType === 'NerdQAxe') {
            const resetReason = (data.lastResetReason || '').toLowerCase();
            // Common fault-related reset reasons in ESP-Miner
            if (resetReason.includes('panic') || resetReason.includes('wdt') || resetReason.includes('brownout')) {
                isNerdQAxeFault = true;
            }
            // Deadlock detection: Uptime > 60s + Zero Hashrate + High Errors
            if (data.uptimeSeconds > 60 && hashrate === 0 && currentHWErrorCount > 100) {
                isNerdQAxeFault = true;
            }
        }

        // C. VR Temperature Check (Soft Fault)
        const isVrTooHot = vrTemp > 0 && vrTemp >= (config.vrTempLimit || 85);

        // D. Power Limit Check (Soft Fault)
        const isPowerTooHigh = power > 0 && power >= (config.powerLimit || 999);

        // E. Fallback Fault Inference (Generic)
        const isUnderperforming = expectedHashrate > 100 && hashrate < (expectedHashrate * 0.05);
        const isFallbackFault = isUnderperforming && power < 10.0 && state.currentFreq > config.minFreq;

        // F. Low Hashrate / Zero Power Detection (NerdQAxe Specific)
        let isPowerFault = false;

        // Calculate Expected Hashrate if not provided
        let expectedHash = expectedHashrate;
        if (!expectedHash && state.deviceType === 'NerdQAxe') {
            // BM1370 approx 2.01 GH/MHz per chip.
            const chipCount = data.asicCount || 1;
            const freq = data.frequency || state.currentFreq || 0;
            if (freq > 0) {
                expectedHash = freq * chipCount * 2.01;
            }
        }

        if (state.deviceType === 'NerdQAxe') {
            // 1. Zero Power Fault: Input is good (>10V), but Power is near 0 (<5W)
            if (inputVolts > 10000 && power < 5.0) {
                isPowerFault = true;
                reasons.push(`NERDQAXE_ZERO_POWER(${power}W, In:${inputVolts}mV)`);
            }

            // 2. Low Hashrate Fault: < 2% of expected (Catch "Zombie" state, ignore struggling miners)
            // A struggling miner (e.g. 500GH/s vs 2000GH/s) needs more voltage, not a critical fault.
            if (expectedHash > 0 && hashrate < (expectedHash * 0.02)) {
                isPowerFault = true; // Utilizing generic power fault flag or creating new
                reasons.push(`NERDQAXE_ZOMBIE_HASH(${hashrate.toFixed(1)}/${expectedHash.toFixed(1)}GH)`);
            }
        }

        // --- 4. Aggregate Faults ---
        const isCriticalFault = hasApiFault || isNerdQAxeFault || isFallbackFault || isInputVoltsOutOfRange || isPowerFault;
        const isSoftFault = isVrTooHot || isPowerTooHigh;

        // Collect Reasons
        if (hasApiFault) reasons.push(`API_FAULT(${data.power_fault})`);
        if (isNerdQAxeFault) reasons.push(`NERDQAXE_FAULT(Reset:${data.lastResetReason || 'Unknown'})`);
        if (isFallbackFault) reasons.push(`FALLBACK_FAULT(${hashrate.toFixed(0)}H/${power.toFixed(1)}W)`);
        if (isInputVoltsOutOfRange) reasons.push(`VOLTAGE_OUT_OF_RANGE(${inputVolts}mV)`);
        if (isTempGlitch) reasons.push(`TEMP_GLITCH_DETECTED(-${tempDrop.toFixed(1)}C)`);
        if (isVrTooHot) reasons.push(`VR_HOT(${vrTemp}C)`);
        if (isPowerTooHigh) reasons.push(`POWER_LIMIT(${power}W)`);

        return {
            isCriticalFault,
            isSoftFault,
            reasons,
            isTempGlitch,
            tempDrop,
            isVrTooHot,     // Needed for specific handling
            isPowerTooHigh  // Needed for specific handling
        };
    }
}

module.exports = FaultDetector;
