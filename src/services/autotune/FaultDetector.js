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

        // C. Fallback Fault Inference (Generic)
        const isUnderperforming = expectedHashrate > 100 && hashrate < (expectedHashrate * 0.05);
        const isFallbackFault = isUnderperforming && power < 10.0 && state.currentFreq > config.minFreq;

        // D. Soft Faults
        const isVrTooHot = vrTemp >= config.maxVrTemp;
        const isPowerTooHigh = power > config.maxWatts;

        // --- 4. Aggregate Faults ---
        const isCriticalFault = hasApiFault || isNerdQAxeFault || isFallbackFault || isInputVoltsOutOfRange;
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
