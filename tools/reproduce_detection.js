
const AutoTuneEngine = require('../src/services/AutoTuneEngine');

// Mock data: Bitaxe GT 800 (12V)
const mockRawData_GT800 = {
    "temp": 45.5,
    "voltage": 12000,
    "ASICModel": "BM1366",
    "hostname": "BitaxeGT800-1234",
};

// Mock data: Standard Bitaxe (5V)
const mockRawData_Standard = {
    "temp": 40.0,
    "voltage": 5000,
    "ASICModel": "BM1366",
    "hostname": "BitaxeUltra-5678"
};

// Mock data: NerdqAxe++ (12V, 4x BM1370)
// Assuming hostname contains 'nerdqaxe' and voltage is 12V
const mockRawData_NerdqAxe = {
    "temp": 50.0,
    "voltage": 12100,
    "ASICModel": "BM1370",
    "hostname": "NerdqAxe-F4A1",
    "asicCount": 4
};

console.log("--- Testing AutoTuneEngine.detectDeviceType with Actual Code ---\n");

try {
    const typeGT800 = AutoTuneEngine.prototype.detectDeviceType.call(null, mockRawData_GT800);
    console.log(`GT 800 [hostname: ${mockRawData_GT800.hostname}, V: ${mockRawData_GT800.voltage}]: \n -> Detected: ${typeGT800}`);
    if (typeGT800 !== '12V') console.error("FAIL: Expected 12V");
    else console.log("PASS");

    console.log("");

    const typeStandard = AutoTuneEngine.prototype.detectDeviceType.call(null, mockRawData_Standard);
    console.log(`Standard [hostname: ${mockRawData_Standard.hostname}, V: ${mockRawData_Standard.voltage}]: \n -> Detected: ${typeStandard}`);
    if (typeStandard !== '5V') console.error("FAIL: Expected 5V");
    else console.log("PASS");

    console.log("");

    const typeNerdqAxe = AutoTuneEngine.prototype.detectDeviceType.call(null, mockRawData_NerdqAxe);
    console.log(`NerdqAxe++ [hostname: ${mockRawData_NerdqAxe.hostname}, V: ${mockRawData_NerdqAxe.voltage}]: \n -> Detected: ${typeNerdqAxe}`);
    if (typeNerdqAxe !== '12V') console.error("FAIL: Expected 12V");
    else console.log("PASS");

    // Test NerdqAxe with weird hostname but correct voltage
    const mockRawData_NerdqAxe_Renamed = { ...mockRawData_NerdqAxe, hostname: "MyCustomMiner" };
    const typeNerdqAxeRenamed = AutoTuneEngine.prototype.detectDeviceType.call(null, mockRawData_NerdqAxe_Renamed);
    console.log(`NerdqAxe (Renamed) [hostname: ${mockRawData_NerdqAxe_Renamed.hostname}, V: ${mockRawData_NerdqAxe_Renamed.voltage}]: \n -> Detected: ${typeNerdqAxeRenamed}`);
    if (typeNerdqAxeRenamed !== '12V') console.error("FAIL: Expected 12V (via voltage check)");
    else console.log("PASS (via voltage)");

} catch (error) {
    console.error("Error executing detection:", error);
}
