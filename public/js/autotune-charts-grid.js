// AutoTune Grid Heatmaps (Canvas-based)

// Module-level cache for container width
let cachedContainerWidth = null;

function renderDetailsGrid(log, faultHistory, currentSettings, currentStats = null) {
    try {
        if (!faultHistory || !Array.isArray(faultHistory)) {
            faultHistory = [];
        }

        // Optimization: Get container width once for all grids
        let containerWidth = 800; // Default fallback

        const gridCanvas = document.getElementById('detailsChartGrid');
        if (gridCanvas && gridCanvas.parentElement) {
            const cw = gridCanvas.parentElement.clientWidth;
            if (cw > 0) {
                containerWidth = cw;
                cachedContainerWidth = cw;
            } else if (cachedContainerWidth !== null) {
                containerWidth = cachedContainerWidth;
            }
        } else if (cachedContainerWidth !== null) {
            containerWidth = cachedContainerWidth;
        }

        // STATIC BOUNDS CONFIGURATION
        const MIN_VOLT = 941;
        const MAX_VOLT = 1350;
        const STEP_VOLT = 10; // mV

        const MIN_FREQ = 400;
        const MAX_FREQ = 1200;
        const STEP_FREQ = 25; // MHz

        // Generate Grid Dimensions
        // We add 1 to include the end boundary
        const numCols = Math.floor((MAX_VOLT - MIN_VOLT) / STEP_VOLT) + 1;
        const numRows = Math.floor((MAX_FREQ - MIN_FREQ) / STEP_FREQ) + 1;

        // Initialize 2D Matrix (Array of rows, where each row is array of cells)
        // matrix[rowIndex][colIndex]
        const matrix = [];
        for (let r = 0; r < numRows; r++) {
            const row = [];
            for (let c = 0; c < numCols; c++) {
                row.push({
                    hash: -Infinity,
                    eff: Infinity,
                    temp: Infinity,
                    hasFault: false,
                    count: 0,
                    // Store center value of bin for tooltip
                    volt: MIN_VOLT + (c * STEP_VOLT),
                    freq: MIN_FREQ + (r * STEP_FREQ)
                });
            }
            matrix.push(row);
        }

        // Helper to get bins from values
        const getBin = (v, f) => {
            if (v < MIN_VOLT || v > MAX_VOLT || f < MIN_FREQ || f > MAX_FREQ) return null;

            // Find closest bin center
            // Currently using 'floor' logic relative to start
            const c = Math.round((v - MIN_VOLT) / STEP_VOLT);
            const r = Math.round((f - MIN_FREQ) / STEP_FREQ);

            if (r >= 0 && r < numRows && c >= 0 && c < numCols) {
                return matrix[r][c];
            }
            return null;
        };

        // 1. Process Log
        log.forEach(e => {
            if (!e.voltage || !e.freq) return;
            const v = parseFloat(e.voltage);
            const f = parseFloat(e.freq);

            const cell = getBin(v, f);
            if (!cell) return; // Skip out of bounds

            cell.count++;

            // Hashrate (Max is best)
            if (e.hashrate && e.hashrate > 0) {
                cell.hash = Math.max(cell.hash, e.hashrate);
            }

            // Efficiency (Min is best, ignore 0/null)
            let eff = null;
            if (e.power && e.hashrate > 0) {
                eff = e.power / (e.hashrate / 1000);
            }
            if (eff && eff > 0 && eff < 1000) {
                cell.eff = Math.min(cell.eff, eff);
            }

            if (e.temp && e.temp > 0) {
                cell.temp = Math.min(cell.temp, e.temp);
            }

            // Keep precision for tooltip
            if (cell.sumVolt === undefined) cell.sumVolt = 0;
            if (cell.sumFreq === undefined) cell.sumFreq = 0;
            cell.sumVolt += v;
            cell.sumFreq += f;
        });

        // 2. Process Faults
        if (faultHistory) {
            faultHistory.forEach(f => {
                if (!f.voltage || !f.freq) return;
                const v = parseFloat(f.voltage);
                const freq = parseFloat(f.freq);
                const cell = getBin(v, freq);
                if (cell) cell.hasFault = true;
            });
        }

        // 3. Current Settings
        // We don't modify the cell data for current settings, we just pass the object to drawing function
        // But we DO want to show provisional data if cell is empty
        if (currentSettings && currentStats) {
            const v = parseFloat(currentSettings.voltage || currentSettings.volt || 0);
            const f = parseFloat(currentSettings.frequency || currentSettings.freq || 0);
            const cell = getBin(v, f);

            if (cell && cell.count === 0) {
                let hr = currentStats.hashrate;
                if (hr > 1000000) hr = hr / 1000000;

                if (hr > 0) cell.hash = hr;
                if (currentStats.power && hr > 0) {
                    cell.eff = currentStats.power / (hr / 1000);
                }
                if (currentStats.temp > 0) cell.temp = currentStats.temp;
                cell.isProvisional = true;
            }
        }

        // Setup Shared Data
        const sharedData = {
            matrix,
            numCols,
            numRows,
            minVolt: MIN_VOLT,
            maxVolt: MAX_VOLT,
            stepVolt: STEP_VOLT,
            minFreq: MIN_FREQ,
            maxFreq: MAX_FREQ,
            stepFreq: STEP_FREQ
        };

        // 1. Hashrate Grid
        drawHeatmapGrid(
            'detailsChartGrid',
            sharedData,
            'hash',
            (val) => Math.round(val),
            false, // High is Good
            { min: 500, max: 2500 },
            currentSettings,
            containerWidth
        );

        // 2. Efficiency Grid
        drawHeatmapGrid(
            'detailsChartEfficiencyGrid',
            sharedData,
            'eff',
            (val) => val.toFixed(2),
            true, // Low is Good
            { min: 15, max: 25 },
            currentSettings,
            containerWidth
        );

        // 3. Temperature Grid
        drawHeatmapGrid(
            'detailsChartTempGrid',
            sharedData,
            'temp',
            (val) => val.toFixed(1) + '°C',
            true, // Low is Good
            { min: 45, max: 75 },
            currentSettings,
            containerWidth
        );
    } catch (e) {
        console.error("Error rendering grids:", e);
    }
}

function drawHeatmapGrid(canvasId, sharedData, metricKey, formatValueFn, inverseColors, customRange, currentSettings, containerWidth) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const { matrix, numCols, numRows, minVolt, maxVolt, stepVolt, minFreq, maxFreq, stepFreq } = sharedData;

    // Calculate Min/Max for Color Scale
    let minVal = Infinity;
    let maxVal = -Infinity;
    let hasData = false;

    // Iterate whole matrix
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const cell = matrix[r][c];
            const val = cell[metricKey];
            if (val !== Infinity && val !== -Infinity && val !== undefined && val !== null) {
                minVal = Math.min(minVal, val);
                maxVal = Math.max(maxVal, val);
                hasData = true;
            }
        }
    }

    if (!hasData) {
        minVal = 0; maxVal = 100;
        if (customRange) { minVal = customRange.min; maxVal = customRange.max; }
    } else {
        if (customRange) {
            if (customRange.min !== undefined) minVal = customRange.min;
            if (customRange.max !== undefined) maxVal = customRange.max;
        }
    }

    // Grid Layout - Fixed Canvas Size, Dynamic Cell Size relative to Bounds
    // INCREASE PADDING TO 80 to fix label overlap
    const padding = 80;
    const bottomPadding = 60;
    const rightPadding = 20;
    const topPadding = 20;

    // Get container dimensions
    const width = containerWidth || (canvas.parentElement ? canvas.parentElement.clientWidth : 800);
    const height = 400; // Fixed height

    const availableWidth = width - padding - rightPadding;
    const availableHeight = height - bottomPadding - topPadding;

    const cellWidth = availableWidth / numCols;
    // Note: Freq (Rows) usually go from Low (Bottom) to High (Top) visually?
    // In previous code `distinctFreqs` was sort `b - a` (descending, so top is high).
    // Here `matrix` r=0 is MIN_FREQ (400).
    // If we want 400 at BOTTOM, we need to invert drawing Y.
    // Or we just draw r=0 at bottom.
    const cellHeight = availableHeight / numRows;

    // Resize canvas
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    // Helper: Color Scale
    const getColor = (val, min, max) => {
        if (val === null || val === undefined) return 'rgba(255,255,255,0.05)';

        const clamped = Math.max(min, Math.min(max, val));
        if (max === min) return '#10b981';

        let pct = (clamped - min) / (max - min);
        if (inverseColors) pct = 1 - pct;

        const hue = Math.floor(pct * 120);
        return `hsl(${hue}, 70%, 50%)`;
    };

    // Draw Cells
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            // Logic for Y-axis direction:
            // r=0 is MIN_FREQ. Usually we want MIN at BOTTOM?
            // Chart.js standard: min at bottom.
            // Canvas coords: 0 is Top.
            // So to draw MIN at BOTTOM, row 0 should be at `height - bottomPadding - cellHeight`.

            const x = padding + (c * cellWidth);
            // Invert row index for drawing so r=0 (Min Freq) is at bottom
            const drawRowIndex = (numRows - 1) - r;
            const y = topPadding + (drawRowIndex * cellHeight);

            const cell = matrix[r][c];
            const val = cell[metricKey];
            const isValid = val !== Infinity && val !== -Infinity && val !== undefined && val !== null;

            // Background
            if (isValid) {
                ctx.fillStyle = getColor(val, minVal, maxVal);
                ctx.fillRect(x, y, cellWidth + 0.5, cellHeight + 0.5); // +0.5 to fix gap artifacts
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.05)'; // Empty slot
                ctx.fillRect(x, y, cellWidth + 0.5, cellHeight + 0.5);
            }

            // Fault
            if (cell.hasFault) {
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + cellWidth, y + cellHeight);
                ctx.moveTo(x + cellWidth, y);
                ctx.lineTo(x, y + cellHeight);
                ctx.stroke();
            }

            // Highlight Current Settings
            if (currentSettings) {
                const cv = parseFloat(currentSettings.voltage || currentSettings.volt || 0);
                const cf = parseFloat(currentSettings.frequency || currentSettings.freq || 0);

                // Check if current setting falls in this bin
                // Simple threshold check
                const vDiff = Math.abs(cv - cell.volt);
                const fDiff = Math.abs(cf - cell.freq);

                // Matches if within half step
                if (vDiff <= stepVolt / 2 && fDiff <= stepFreq / 2) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, cellWidth, cellHeight);
                }
            }

            // Text
            if (isValid && cellWidth > 25 && cellHeight > 15) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(formatValueFn(val), x + cellWidth / 2, y + cellHeight / 2);
            }
        }
    }

    // Draw Axis Labels
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';

    // X-Axis (Voltage)
    ctx.textAlign = 'right';
    for (let c = 0; c < numCols; c++) {
        // Skip some labels if crowded
        // Show label every ~50px
        const pxPerCol = cellWidth;
        const skip = Math.ceil(40 / pxPerCol);

        if (c % skip !== 0) continue;

        const volt = minVolt + (c * stepVolt);
        const x = padding + (c * cellWidth) + (cellWidth / 2);
        const y = height - bottomPadding + 10;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(volt, 0, 0);
        ctx.restore();
    }

    ctx.textAlign = 'right';
    ctx.fillText("Volt (mV)", width - 10, height - 10);

    // Y-Axis (Freq)
    ctx.textAlign = 'right';
    for (let r = 0; r < numRows; r++) {
        const pxPerRow = cellHeight;
        const skip = Math.ceil(20 / pxPerRow);
        if (r % skip !== 0) continue;

        const freq = minFreq + (r * stepFreq);

        // r=0 is bottom
        const drawRowIndex = (numRows - 1) - r;
        const y = topPadding + (drawRowIndex * cellHeight) + (cellHeight / 2);
        const x = padding - 10; // 80 - 10 = 70px

        ctx.fillText(freq, x, y);
    }

    ctx.save();
    // Rotate label 
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText("Freq (MHz)", 0, 0);
    ctx.restore();

    // Tooltips
    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (mouseX < padding || mouseX > width - rightPadding ||
            mouseY < topPadding || mouseY > height - bottomPadding) {
            hideTooltip()
            return;
        }

        const col = Math.floor((mouseX - padding) / cellWidth);
        // Correct Y mouse mapping
        const rawRow = Math.floor((mouseY - topPadding) / cellHeight);
        // Invert back to get logical row
        const row = (numRows - 1) - rawRow;

        if (col < 0 || col >= numCols || row < 0 || row >= numRows) {
            hideTooltip();
            return;
        }

        const cell = matrix[row][col];
        if (cell) {
            const val = cell[metricKey];
            const isValid = val !== Infinity && val !== -Infinity && val !== undefined && val !== null;

            if (isValid) {
                const valStr = formatValueFn(val);

                // Show precise average if data exists, otherwise bin center
                let displayVolt = cell.volt;
                let displayFreq = cell.freq;

                if (cell.count > 0 && cell.sumVolt !== undefined && cell.sumFreq !== undefined) {
                    displayVolt = (cell.sumVolt / cell.count).toFixed(2);
                    displayFreq = (cell.sumFreq / cell.count).toFixed(2);
                } else {
                    displayVolt = cell.volt.toFixed(2);
                    displayFreq = cell.freq.toFixed(2);
                }

                showTooltip(e.clientX, e.clientY, `
                    <div style="font-weight: bold; margin-bottom: 2px;">${valStr}</div>
                    <div style="font-size: 0.8em; color: #cbd5e1;">${displayVolt}mV / ${displayFreq}MHz</div>
                     ${cell.hasFault ? '<div style="color: #ef4444; font-size: 0.8em; margin-top: 2px;">⚠️ Fault Recorded</div>' : ''}
                `);
            } else {
                hideTooltip();
            }
        }
    };

    canvas.onmouseleave = () => hideTooltip();
}
