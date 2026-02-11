const CONFIG = require('../../config');
const { DEVICE_VOLTAGE_LIMITS } = require('./AutoTuneConstants');

class DeviceDetector {
    /**
     * Detect ASIC chip model from miner data
     */
    static detectASICModel(minerData) {
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
        if (deviceName.includes('nerdqaxe')) return 'BM1370';
        if (deviceName.includes('hex')) return 'BM1368';

        return null; // Unknown chip
    }

    /**
     * Detect device type and voltage limits from miner data
     */
    static detectDeviceType(minerData) {
        const deviceName = (minerData.deviceModel || minerData.miner || minerData.hostname || '').toLowerCase();
        const version = (minerData.version || '').toLowerCase();
        const boardVersion = (minerData.boardVersion || '').toLowerCase();


        // 1. Explicit Device Model Check (NerdQAxe++ uses deviceModel)
        if (minerData.deviceModel && minerData.deviceModel.toLowerCase().includes('nerdqaxe')) {
            return 'NerdQAxe';
        }

        // 2. Board Version Detection (Most Reliable)
        if (boardVersion.includes('rev 6') || boardVersion.includes('rev 5')) {
            return 'NerdQAxe'; // NerdQAxe++ (Rev 6.1, 5.1, etc)
        }
        if (boardVersion.includes('602')) {
            return '12V'; // Bitaxe GT 800
        }
        if (boardVersion.includes('601')) {
            return 'Gamma601';
        }

        // 2. Name-based / Other Detection (Fallback)
        if (deviceName.includes('nerdqaxe') || deviceName.includes('nerdq')) {
            return 'NerdQAxe';
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
     * Get device-specific voltage cap (replaces simple frequency-based cap)
     */
    static getDeviceVoltageCap(state, minerData, config = null) {
        // If config is not passed, try to load default conservative (or handle in caller)
        // Ideally caller passes the config object for the current mode.
        if (!config) {
            config = CONFIG.AUTOTUNE['conservative'];
        }

        const deviceType = state.deviceType || this.detectDeviceType(minerData);
        const deviceLimits = DEVICE_VOLTAGE_LIMITS[deviceType] || DEVICE_VOLTAGE_LIMITS['5V'];

        // Use mode-specific max voltage, but don't exceed device hardware limit
        return Math.min(config.maxVoltage, deviceLimits.maxVoltage);
    }
}

module.exports = DeviceDetector;
