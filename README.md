# LotteryMiner Dashboard

This is a local dashboard to monitor and configure your LotteryMiner fleet via UDP and REST API. It supports Bitcoin (BTC) and Bitcoin Cash (BCH) mining stats and serves as a central hub for real-time monitoring and autonomous optimization.

> [!IMPORTANT]
> **NerdMiner Users**: To use auto-discovery and remote configuration, you must flash the [LotteryMiner Custom Firmware](https://github.com/WeisTekEng/NerdMiner_v2). This firmware broadcasts the required JSON payload via UDP.
>
> **Bitaxe Users**: No special firmware is required! Official Bitaxe firmware works out-of-the-box with this dashboard.

## Key Features

*   **Auto-Tune Engine**: Autonomous frequency and voltage optimization.
    *   **Conservative**: Safe adjustments to optimize stability.
    *   **Aggressive**: Maximizes performance (requires caution/improved cooling).

## Auto-Tune Engine Deep Dive

The Auto-Tune engine is an autonomous feedback system designed to find the "sweet spot" for each individual ASIC chip. Since no two chips are identical (silicon lottery), the engine monitors several telemetry points every 10-30 seconds to make micro-adjustments.

### How it Works
1.  **Telemetry Collection**: The engine fetches real-time data from the miner, including core temperature, VRM temperature, hash performance (actual vs expected), and hardware error rates.
2.  **Analysis**:
    *   **Stability Monitoring**: It calculates a weighted "Smooth Error Rate." If hardware errors or rejected shares spike, the engine immediately prioritizes stability.
    *   **Thermal Guarding**: If temperatures approach pre-defined limits, it initiates proactive throttling before the hardware reaches critical emergency thresholds.
    *   **Efficiency Analysis**: In Conservative mode, it calculates Joules per Terahash (J/TH) to ensure the miner isn't just fast, but cost-effective.
3.  **Adjustment Actions**:
    *   **Frequency Scaling**: Increases frequency in small steps (10MHz) when conditions are perfect (low error, low temp).
    *   **Voltage Balancing**: If a frequency increase leads to instability, the engine attempts to "reinforce" the chip with a small voltage bump before resorting to a frequency rollback.
    *   **Pullback Optimization**: Once a high performance state has been stable for a long period, the engine will carefully attempt to lower the voltage (Pullback) to reduce heat and power consumption without losing speed.

### Operation Modes
- **Conservative Mode**:
    - Lower voltage ceilings (max 1250mV).
    - Hard temperature targets (62°C).
    - Focuses on efficiency and 24/7 uptime without user intervention.
- **Aggressive Mode**:
    - Higher voltage ceilings (up to 1400mV).
    - Higher thermal tolerance (targets up to 71°C).
    - Prioritizes raw hashrate. **Important:** Requires high-quality cooling or a fan upgrade as heat generation increases exponentially at higher voltages.

### Safety & Self-Healing
- **Emergency Cooling**: If a miner hits 75°C+, the engine immediately drops both frequency and voltage to the absolute minimum until the hardware recovers.
- **Power Fault Detection**: If the miner's API reports a power fault or the hashrate drops to zero while energy is still being consumed, the engine will automatically reset the settings to safe defaults and trigger a remote restart.
- **Stabilization Periods**: After any adjustment, the engine enters a "Stabilization" window to prevent "chasing" transient spikes, ensuring a steady and reliable hash rate.
*   **Live Server Logs**: Real-time streaming of server-side adjustments and status updates directly on the dashboard.
*   **Multi-Coin Support**: Track Bitcoin (BTC) and Bitcoin Cash (BCH) network stats simultaneously.
*   **Solo Mining Odds**: Integrated "Lottery" stats calculation for both BTC and BCH, including potential rewards and daily win probability.
*   **Auto-Discovery**: Miners appear automatically via UDP broadcast (port 33333).
*   **Remote Configuration**: Change Pool, Port, Address, and Password via a secure backend proxy.
*   **Modular UI**: Responsive, modern interface with detailed historical hashrate charts.

## Remote Configuration

To configure a miner remotely:
1.  Ensure you are running the **latest firmware** with the REST API enabled.
2.  On the dashboard, click the **Gear Icon** on the miner card.
3.  A modal will appear showing the current settings.
4.  Update your Pool, Wallet, etc., and click **Save Changes**.
5.  The miner will save settings to NVS and restart automatically.

## Live Server Logs
The dashboard now includes a "Live Logs" page. This allows you to monitor:
-   **Auto-Tune Adjustments**: See exactly when the engine increases or throttles a miner.
-   **Discovery Events**: Track when new devices are found on your network.
-   **Network Status**: Real-time feedback on API communication and stats fetching.

## Installation

### Non-Docker Setup
1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Start the Server**:
    ```bash
    node server.js
    ```
3.  **Access Dashboard**:
    Open your browser and navigate to `http://localhost:3000`.

### Docker & Umbrel Support

#### Linux / Umbrel (Recommended)
```bash
docker compose up -d --build
```
*Uses `network_mode: "host"` for proper UDP broadcast reception.*

#### Windows (Testing/Development)
```bash
docker compose -f docker-compose.windows.yml up -d --build
```
*Uses port mapping. Access at http://localhost:3000*

**Note:** UDP broadcasts from miners may not reach the container on Windows due to Docker's networking limitations. For full functionality, deploy on Linux/Umbrel.

### Umbrel
This app is ready for Umbrel.
1.  install Portainer from the umbrel app store
2.  Once in portainer, navigate to the environment you want to add this to, then click on "Add Container"
3.  for docker.io image, use `ocybress/nerdminer-dashboard-linux:r0.0.8`
4.  for the ports, add `3000` TCP, and `33333` UDP
5.  click "diploy the container"
6.  wait for the container to start
7.  navigate to `http://localhost:3000` to access the dashboard
8.  you can expose this via tailscail if you want to access it from other devices

### Persistent Configuration (Editing Settings)
To ensure your settings are saved when the container restarts and to allow manual editing of configuration files:
1.  In Portainer, during container creation (or under "Duplicate/Edit"), go to the **Volumes** tab.
2.  Click **+ map additional volume**.
3.  **Container path**: `/app/data`
4.  **Host path** (or Volume): 
    - Select **Bind** (important for easy file access).
    - Enter a path for your data on the host, for example: `/home/umbrel/lottery-data`.
5.  This allows you to edit settings directly from your host filesystem. Settings will persist exactly in that folder even if the container is deleted.

### Advanced Configuration (config.json)
You can override any setting in the dashboard (ports, scan intervals, auto-tune profiles) by creating a `config.json` file in your mapped `data` folder.

**Example `config.json`:**
```json
{
  "PORTS": {
    "HTTP": 8080
  },
  "LIMITS": {
    "SCAN_INTERVAL": 300000
  },
  "AUTOTUNE": {
    "aggressive": {
      "maxVoltage": 1450,
      "maxFreq": 1300
    }
  }
}
```
*Note: You only need to include the settings you want to change. Others will keep their default values.*

## Tips / Donations

Found this useful? Tips are never required but appreciated!

**BTC:** `bc1qjqhg5c2f6da8y4qr7upegwhkvl2376xzlpwf5p`
**ETH:** `0x1c054d43c8b6452ceb5d9fe773cc7da66764c283`
**SOL:** `GTMphvuZU3QsHbieCwWutf1gRGmLWWEVY5dPq73pkgnz`
**USDC on Ethereum:** `0x1c054d43c8b6452ceb5d9fe773cc7da66764c283`

---

<img width="1903" height="1113" alt="Dashboard" src="https://github.com/user-attachments/assets/6d91323c-5c8c-4ad9-beb9-4f27e5b845e0" />




