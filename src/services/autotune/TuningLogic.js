const { PLL_VOLTAGE_CURVES, DEVICE_VOLTAGE_LIMITS } = require('./AutoTuneConstants');

class TuningLogic {
    /**
     * Get recommended voltage for a frequency using PLL curves
     * Returns null if no curve available (fallback to current logic)
     */
    static getRecommendedVoltage(freq, asicModel, deviceType) {
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

    static calculateDailyCost(powerW, kwhPrice) {
        if (!powerW || !kwhPrice) return 0;
        // Watts / 1000 = kW * 24 hours * Price
        return (powerW / 1000) * 24 * kwhPrice;
    }
}

module.exports = TuningLogic;
