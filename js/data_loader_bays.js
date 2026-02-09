// ================================================================
// CONFIGURACIÓN Y VARIABLES GLOBALES - BAYS VERSION
// ================================================================
let allData = [];
let chart = null;
let currentProject = 'L10'; // Proyecto activo
let currentBay = 'all'; // Bay actual

// Configuración por proyecto
const PROJECT_CONFIG = {
    L10: {
        stages: ['TN','TO','TP','N1','N2','QN','RS','MG','MD','M1','MW','SU','BS'],
        title: 'L10 Prestest Dashboard (Bays)',
        excludeUSNs: []
    },
    L11: {
        stages: ['WT','PT','YC','WL','MG','MD','M1','MW','SU','WB','BO'],
        title: 'L11 Prestest Dashboard (Bays)',
        excludeUSNs: []
    },
    SUPER_L10_POT: {
        stages: ['TN','TO','TP','N1','N2','QN','RS','MG','MD','M1','MW','SU','BS'],
        title: 'Super L10 PoT Dashboard',
        excludeUSNs: []
    }
};

let STAGES = PROJECT_CONFIG[currentProject].stages;
const API_URL = 'http://10.250.36.73:8080/pretest_times_analisys/php/pretest_api_bays.php';

// Lista de bays disponibles (se llenará dinámicamente)
let availableBays = [];

// ================================================================
// UTILIDADES ESTADÍSTICAS
// ================================================================

/**
 * Calcula estadísticas (avg, p50, p90, min, max) de un array de valores
 */
function calculateStats(values) {
    if (!values || values.length === 0) return null;
    
    // Filter out null, NaN, and NEGATIVE values (invalid durations)
    const sorted = values.filter(v => v !== null && !isNaN(v) && v >= 0).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;
    
    const p50Index = Math.floor(sorted.length * 0.50);
    const p90Index = Math.floor(sorted.length * 0.90);
    
    return {
        avg: avg,
        p50: sorted[p50Index],
        p90: sorted[p90Index],
        min: sorted[0],
        max: sorted[sorted.length - 1],
        count: sorted.length
    };
}

/**
 * Convierte horas a string formateado
 */
function hoursToString(hours) {
    if (hours === null || isNaN(hours)) return 'N/A';
    return hours.toFixed(2) + 'h';
}

// ================================================================
// CARGA DE DATOS
// ================================================================

/**
 * Carga datos desde la API y actualiza el dashboard
 */
async function loadData() {
    try {
        document.getElementById('usnCount').textContent = 'Loading...';
        
        // Add timestamp to prevent browser caching
        const cacheBuster = `?_=${new Date().getTime()}`;
        const projectParam = `&project=${currentProject}`;
        const response = await fetch(API_URL + cacheBuster + projectParam, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        const result = await response.json();
        
        if (!result.success) {
            alert('Error: ' + result.error);
            return;
        }
        
        allData = result.data;
        
        // Extraer bays únicos
        extractAvailableBays();
        
        // Crear pestañas de bays si estamos en L10
        if (currentProject === 'L10') {
            createBayTabs();
        }
        
        // Aplicar filtro de bay
        const filteredData = filterDataByBay();
        
        document.getElementById('usnCount').textContent = `${filteredData.length} USNs`;
        
        // Poblar filtro de modelos
        populateModelFilter(filteredData);
        
        // Actualizar visualizaciones
        updateChart();
        updateMetrics();
        updateRawData();
        
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Error al cargar datos: ' + error.message);
    }
}

/**
 * Extrae la lista de bays únicos de los datos
 */
function extractAvailableBays() {
    const baySet = new Set();
    allData.forEach(d => {
        if (d.bay) {
            baySet.add(d.bay);
        }
    });
    
    // Sort bays numerically (BAY_1, BAY_2, ..., BAY_13)
    availableBays = Array.from(baySet).sort((a, b) => {
        // Extract numbers from bay names (e.g., "BAY_11" -> 11)
        const numA = parseInt(a.replace(/\D/g, ''));
        const numB = parseInt(b.replace(/\D/g, ''));
        return numA - numB;
    });
}

/**
 * Crea las pestañas de bays
 */
function createBayTabs() {
    const container = document.getElementById('bayTabsContainer');
    if (!container) return;
    
    let html = `
        <button class="bay-tab ${currentBay === 'all' ? 'active' : ''}" data-bay="all">
            📊 All Bays
        </button>
    `;
    
    availableBays.forEach(bay => {
        html += `
            <button class="bay-tab ${currentBay === bay ? 'active' : ''}" data-bay="${bay}">
                ${bay}
            </button>
        `;
    });
    
    container.innerHTML = html;
    
    // Agregar event listeners
    document.querySelectorAll('.bay-tab').forEach(button => {
        button.addEventListener('click', function() {
            currentBay = this.getAttribute('data-bay');
            
            // Actualizar UI
            document.querySelectorAll('.bay-tab').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Recargar visualizaciones
            const filteredData = filterDataByBay();
            document.getElementById('usnCount').textContent = `${filteredData.length} USNs`;
            populateModelFilter(filteredData);
            updateChart();
            updateMetrics();
            updateRawData();
        });
    });
}

/**
 * Filtra los datos por el bay actual
 */
function filterDataByBay() {
    if (currentBay === 'all') {
        return allData;
    }
    return allData.filter(d => d.bay === currentBay);
}

/**
 * Pobla el select de modelos con los modelos únicos
 */
function populateModelFilter(data) {
    const models = [...new Set(data.map(d => d.model).filter(Boolean))];
    const modelFilter = document.getElementById('modelFilter');
    const metricsModelFilter = document.getElementById('metricsModelFilter');
    const breakdownModelFilter = document.getElementById('breakdownModelFilter');
    
    // Poblar filtro principal
    modelFilter.innerHTML = '<option value="all">Todos</option>';
    models.forEach(m => {
        modelFilter.innerHTML += `<option value="${m}">${m}</option>`;
    });
    
    // Poblar filtro de métricas
    if (metricsModelFilter) {
        metricsModelFilter.innerHTML = '<option value="all">All Models</option>';
        models.forEach(m => {
            metricsModelFilter.innerHTML += `<option value="${m}">${m}</option>`;
        });
    }
    
    // Poblar filtro de breakdown
    if (breakdownModelFilter) {
        breakdownModelFilter.innerHTML = '<option value="all">All Models</option>';
        models.forEach(m => {
            breakdownModelFilter.innerHTML += `<option value="${m}">${m}</option>`;
        });
    }
}


// ================================================================
// ACTUALIZACIÓN DE GRÁFICA
// ================================================================

/**
 * Actualiza la gráfica según el modo de vista seleccionado
 */
function updateChart() {
    const viewMode = document.getElementById('viewMode').value;
    const modelFilter = document.getElementById('modelFilter').value;
    
    // Filtrar datos por bay y modelo
    let filtered = filterDataByBay();
    if (modelFilter !== 'all') {
        filtered = filtered.filter(d => d.model === modelFilter);
    }
    
    // Renderizar según el modo
    if (viewMode === 'all') {
        renderAllUSNChart(filtered);
    } else if (viewMode === 'daily') {
        renderDailyChart(filtered);
    } else if (viewMode === 'batch') {
        renderBatchChart(filtered);
    }
}

/**
 * Renderiza gráfica con todos los USN (average por stage)
 */
function renderAllUSNChart(data) {
    // Aplicar filtro de model del breakdown
    const breakdownModelFilter = document.getElementById('breakdownModelFilter');
    let filtered = data;
    
    if (breakdownModelFilter && breakdownModelFilter.value !== 'all') {
        filtered = filtered.filter(d => d.model === breakdownModelFilter.value);
    }
    
    // Calcular estadísticas por stage
    const datasets = STAGES.map(stage => {
        const durations = filtered
            .map(d => d.stages[stage].duration_hours)
            .filter(v => v !== null && v >= 0);
        const stats = calculateStats(durations);
        
        return {
            stage: stage,
            stats: stats,
            avg: stats ? stats.avg : null
        };
    }).filter(d => d.avg !== null);

    const chartData = {
        labels: datasets.map(d => d.stage),
        datasets: [{
            label: 'Average Duration (hours)',
            data: datasets.map(d => d.avg),
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.3,
            fill: true
        }]
    };

    const config = {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Average Duration per Stage ${currentBay !== 'all' ? '- ' + currentBay : ''}`,
                    font: { size: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const stage = datasets[context.dataIndex];
                            if (!stage.stats) return 'N/A';
                            
                            return [
                                `Average: ${hoursToString(stage.stats.avg)}`,
                                `P50: ${hoursToString(stage.stats.p50)}`,
                                `P90: ${hoursToString(stage.stats.p90)}`,
                                `Min: ${hoursToString(stage.stats.min)}`,
                                `Max: ${hoursToString(stage.stats.max)}`,
                                `Count: ${stage.stats.count}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Hours'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Stage'
                    }
                }
            }
        }
    };

    // Destruir gráfica anterior y crear nueva
    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('chart'), config);
    
    // Renderizar tabla de breakdown
    renderBreakdownTable(datasets, 'all');
}

/**
 * Renderiza gráfica con breakdown por Batch
 */
function renderBatchChart(data) {
    // Extraer número del batch y agrupar
    const batchMap = {};
    
    data.forEach(d => {
        let batchValue = d.batch || 'N/A';
        
        // Extraer solo el número del batch
        const batchMatch = batchValue.match(/\d+/);
        const batchNumber = batchMatch ? batchMatch[0] : batchValue;
        
        if (!batchMap[batchNumber]) {
            batchMap[batchNumber] = [];
        }
        batchMap[batchNumber].push(d);
    });
    
    // Obtener lista de batches y ordenar numéricamente
    const batches = Object.keys(batchMap).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b);
    });
    
    if (batches.length === 0) {
        alert('No batch data available');
        return;
    }
    
    // Colores para cada batch
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#c0392b',
        '#8e44ad', '#16a085', '#27ae60'
    ];
    
    // Crear un dataset por cada batch
    const datasets = batches.map((batch, idx) => {
        const batchData = batchMap[batch];
        
        // Para cada stage, calcular el promedio de este batch
        const avgData = STAGES.map(stage => {
            const durations = batchData
                .map(d => d.stages[stage]?.duration_hours)
                .filter(v => v !== null && !isNaN(v) && v >= 0);
            
            if (durations.length === 0) return null;
            
            const sum = durations.reduce((a, b) => a + b, 0);
            return sum / durations.length;
        });
        
        return {
            label: `Batch ${batch} (${batchData.length} USNs)`,
            data: avgData,
            borderColor: colors[idx % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0.3
        };
    });

    const chartData = {
        labels: STAGES,
        datasets: datasets
    };

    const config = {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Average Duration per Stage by Batch ${currentBay !== 'all' ? '- ' + currentBay : ''}`,
                    font: { size: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const batch = batches[context.datasetIndex];
                            const stage = STAGES[context.dataIndex];
                            const value = context.parsed.y;
                            const count = batchMap[batch].length;
                            return [
                                `Batch ${batch} - ${stage}: ${hoursToString(value)}`,
                                `USNs in batch: ${count}`
                            ];
                        }
                    }
                },
                legend: {
                    display: true,
                    position: 'right'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Average Hours'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Stage'
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 0
                    }
                }
            }
        }
    };

    // Destruir gráfica anterior y crear nueva
    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('chart'), config);
    
    // Renderizar tabla de breakdown por batch
    const tableData = batches.map(batch => {
        const batchData = batchMap[batch];
        const values = STAGES.map(stage => {
            const durations = batchData
                .map(d => d.stages[stage]?.duration_hours)
                .filter(v => v !== null && !isNaN(v) && v >= 0);
            if (durations.length === 0) return null;
            return durations.reduce((a, b) => a + b, 0) / durations.length;
        });
        return {
            batch: batch,
            values: values
        };
    });
    renderBreakdownTable(tableData, 'batch', batches);
}

/**
 * Renderiza gráfica con breakdown diario basado en rs_pass
 */
function renderDailyChart(data) {
    // Agrupar por día basándose en rs_pass
    const byDay = {};
    
    data.forEach(d => {
        const rsPass = d.stages.RS.pass;
        if (!rsPass) return;
        
        const day = rsPass.split(' ')[0];
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(d);
    });

    const days = Object.keys(byDay).sort();
    
    // Crear dataset por cada stage
    const datasets = STAGES.map((stage, idx) => {
        const dailyAvgs = days.map(day => {
            const durations = byDay[day]
                .map(d => d.stages[stage].duration_hours)
                .filter(v => v !== null && v >= 0);
            const stats = calculateStats(durations);
            return stats ? stats.avg : null;
        });

        const colors = [
            '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#c0392b',
            '#8e44ad', '#16a085', '#27ae60'
        ];

        return {
            label: stage,
            data: dailyAvgs,
            borderColor: colors[idx % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 4,
            tension: 0.3
        };
    });

    const chartData = {
        labels: days,
        datasets: datasets
    };

    const config = {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Average Duration per Stage (Daily Breakdown) ${currentBay !== 'all' ? '- ' + currentBay : ''}`,
                    font: { size: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const stage = STAGES[context.datasetIndex];
                            const value = context.parsed.y;
                            return `${stage}: ${hoursToString(value)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Hours'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Date (rs_pass)'
                    }
                }
            }
        }
    };

    // Destruir gráfica anterior y crear nueva
    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('chart'), config);
    
    // Renderizar tabla de breakdown diario
    const tableData = STAGES.map((stage, idx) => ({
        stage: stage,
        days: days,
        values: datasets[idx].data
    }));
    renderBreakdownTable(tableData, 'daily', days);
}

// ================================================================
// BREAKDOWN TABLE
// ================================================================

/**
 * Renderiza tabla de breakdown con métricas
 */
function renderBreakdownTable(data, mode, labels = []) {
    const container = document.getElementById('breakdownTable');
    
    if (mode === 'all') {
        let html = `
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Stage</th>
                        <th>Average</th>
                        <th>P50</th>
                        <th>P90</th>
                        <th>Min</th>
                        <th>Max</th>
                        <th>Count</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.forEach(item => {
            const stats = item.stats;
            if (stats) {
                html += `
                    <tr>
                        <td class="stage-cell">${item.stage}</td>
                        <td class="value-cell">${hoursToString(stats.avg)}</td>
                        <td class="value-cell">${hoursToString(stats.p50)}</td>
                        <td class="value-cell">${hoursToString(stats.p90)}</td>
                        <td class="value-cell">${hoursToString(stats.min)}</td>
                        <td class="value-cell">${hoursToString(stats.max)}</td>
                        <td class="count-cell">${stats.count}</td>
                    </tr>
                `;
            }
        });
        
        html += `</tbody></table>`;
        container.innerHTML = html;
        
    } else if (mode === 'daily') {
        let html = `
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Date</th>
        `;
        
        data.forEach(item => {
            html += `<th>${item.stage}</th>`;
        });
        
        html += `</tr></thead><tbody>`;
        
        labels.forEach((day, idx) => {
            html += `<tr><td class="date-cell">${day}</td>`;
            data.forEach(item => {
                const value = item.values[idx];
                html += `<td class="value-cell">${value !== null ? hoursToString(value) : '-'}</td>`;
            });
            html += `</tr>`;
        });
        
        html += `</tbody></table>`;
        container.innerHTML = html;
        
    } else if (mode === 'batch') {
        let html = `
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Batch</th>
        `;
        
        STAGES.forEach(stage => {
            html += `<th>${stage}</th>`;
        });
        
        html += `</tr></thead><tbody>`;
        
        data.forEach(item => {
            html += `<tr><td class="batch-cell">Batch ${item.batch}</td>`;
            item.values.forEach(value => {
                html += `<td class="value-cell">${value !== null && value !== undefined ? value.toFixed(2) + 'h' : '-'}</td>`;
            });
            html += `</tr>`;
        });
        
        html += `</tbody></table>`;
        container.innerHTML = html;
    }
}

// ================================================================
// MÉTRICAS DE ENVIRONMENT
// ================================================================

/**
 * Actualiza el panel de métricas por environment
 */
function updateMetrics() {
    const modelFilter = document.getElementById('modelFilter').value;
    const metricsModelFilter = document.getElementById('metricsModelFilter').value;
    let filtered = filterDataByBay();
    
    // Filtrar por modelo desde el filtro principal
    if (modelFilter !== 'all') {
        filtered = filtered.filter(d => d.model === modelFilter);
    }
    
    // Filtrar por modelo desde el filtro de métricas
    if (metricsModelFilter !== 'all') {
        filtered = filtered.filter(d => d.model === metricsModelFilter);
    }

    // Calcular métricas
    let env1, env2, env3, total;
    let env1Name, env2Name, env3Name;
    
    env1Name = 'PRETEST';
    env2Name = 'MDaaS';
    env3Name = 'BSL';
    
    env1 = [];
    env2 = [];
    env3 = [];
    total = [];

    filtered.forEach(d => {
        if (!d.stages) return;
        
        const testStart = d.test_start_time;
        const rsPass = d.stages.RS?.pass;
        const suPass = d.stages.SU?.pass;
        const bsPass = d.stages.BS?.pass;

        if (testStart && rsPass) {
            const hours = (new Date(rsPass) - new Date(testStart)) / (1000 * 60 * 60);
            env1.push(hours);
        }

        if (rsPass && suPass) {
            const hours = (new Date(suPass) - new Date(rsPass)) / (1000 * 60 * 60);
            env2.push(hours);
        }

        if (suPass && bsPass) {
            const hours = (new Date(bsPass) - new Date(suPass)) / (1000 * 60 * 60);
            env3.push(hours);
        }

        if (testStart && bsPass) {
            const hours = (new Date(bsPass) - new Date(testStart)) / (1000 * 60 * 60);
            total.push(hours);
        }
    });

    // Calcular estadísticas
    const env1Stats = calculateStats(env1);
    const env2Stats = calculateStats(env2);
    const env3Stats = calculateStats(env3);
    const totalStats = calculateStats(total);

    // Renderizar HTML
    const html = `
        ${renderEnvMetric(env1Name, env1Stats, '#3498db')}
        ${renderEnvMetric(env2Name, env2Stats, '#2ecc71')}
        ${renderEnvMetric(env3Name, env3Stats, '#f39c12')}
        ${renderEnvMetric('Total', totalStats, '#e74c3c')}
    `;

    document.getElementById('envMetrics').innerHTML = html;
    
    // Cargar Quality Metrics si estamos en L10
    if (currentProject === 'L10') {
        loadQualityMetrics(filtered);
    }
}

/**
 * Carga y muestra las Quality Metrics desde PostgreSQL
 */
async function loadQualityMetrics(filteredData) {
    const qualityMetricsDiv = document.getElementById('qualityMetrics');
    
    if (!filteredData || filteredData.length === 0) {
        qualityMetricsDiv.innerHTML = '<p style="color: #95a5a6;">No data available</p>';
        return;
    }
    
    // Mostrar loading
    qualityMetricsDiv.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            Loading quality metrics...
        </div>
    `;
    
    // Obtener lista de USNs
    const usns = filteredData.map(d => d.usn);
    
    if (usns.length === 0) {
        qualityMetricsDiv.innerHTML = '<p style="color: #95a5a6;">No USNs available for quality metrics</p>';
        return;
    }
    
    try {
        // Llamar al API de quality metrics
        const response = await fetch('php/quality_metrics_bays.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ usns: usns })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to load quality metrics');
        }
        
        const pretest = result.data.pretest;
        const mdaas = result.data.mdaas;
        
        // Renderizar métricas - Pretest y MDaaS
        qualityMetricsDiv.innerHTML = `
            <h3 style="color: #2c3e50; font-size: 16px; margin-bottom: 12px; border-bottom: 2px solid #3498db; padding-bottom: 8px;">Pretest Quality</h3>
            <div class="quality-metric" style="margin-bottom: 20px;">
                <div class="quality-item failure-rate">
                    <div class="quality-label">Failure Rate</div>
                    <div class="quality-value" style="color: ${pretest.failure_rate > 5 ? '#e74c3c' : '#27ae60'}">
                        ${pretest.failure_rate.toFixed(2)}%
                    </div>
                    <div class="quality-detail">${pretest.usns_with_info} / ${pretest.total_usns} units</div>
                </div>
                <div class="quality-item yield-pass">
                    <div class="quality-label">Yield First Pass</div>
                    <div class="quality-value" style="color: ${pretest.yield_first_pass >= 95 ? '#27ae60' : '#f39c12'}">
                        ${pretest.yield_first_pass.toFixed(2)}%
                    </div>
                    <div class="quality-detail">${pretest.info_records} INFO records</div>
                </div>
            </div>
            
            <h3 style="color: #2c3e50; font-size: 16px; margin-bottom: 12px; border-bottom: 2px solid #2ecc71; padding-bottom: 8px;">MDaaS Quality</h3>
            <div class="quality-metric">
                <div class="quality-item failure-rate">
                    <div class="quality-label">Failure Rate</div>
                    <div class="quality-value" style="color: ${mdaas.failure_rate > 5 ? '#e74c3c' : '#27ae60'}">
                        ${mdaas.failure_rate.toFixed(2)}%
                    </div>
                    <div class="quality-detail">${mdaas.usns_with_logs} / ${mdaas.total_usns} units</div>
                </div>
                <div class="quality-item yield-pass">
                    <div class="quality-label">Yield First Pass</div>
                    <div class="quality-value" style="color: ${mdaas.yield_first_pass >= 95 ? '#27ae60' : '#f39c12'}">
                        ${mdaas.yield_first_pass.toFixed(2)}%
                    </div>
                    <div class="quality-detail">Log files found</div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading quality metrics:', error);
        qualityMetricsDiv.innerHTML = `<p style="color: #e74c3c;">Failed to load quality metrics</p>`;
    }
}

/**
 * Renderiza HTML para una métrica de environment
 */
function renderEnvMetric(name, stats, color) {
    if (!stats) {
        return `
            <div class="env-metric">
                <h3 style="color: ${color}">${name}</h3>
                <p style="color: #95a5a6;">No data</p>
            </div>
        `;
    }

    return `
        <div class="env-metric">
            <h3 style="color: ${color}">${name}</h3>
            <div class="stat-grid">
                <div class="stat-item highlight-avg">
                    <div class="stat-label">Average</div>
                    <div class="stat-value stat-value-avg">${hoursToString(stats.avg)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">P50</div>
                    <div class="stat-value">${hoursToString(stats.p50)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">P90</div>
                    <div class="stat-value">${hoursToString(stats.p90)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Min</div>
                    <div class="stat-value">${hoursToString(stats.min)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Max</div>
                    <div class="stat-value">${hoursToString(stats.max)}</div>
                </div>
            </div>
        </div>
    `;
}

// ================================================================
// RAW DATA TABLE
// ================================================================

let rawDataVisible = true;
let filteredRawData = [];
let sortColumn = null;
let sortDirection = 'asc';

function toggleRawData() {
    rawDataVisible = !rawDataVisible;
    const container = document.getElementById('rawDataContainer');
    container.style.display = rawDataVisible ? 'block' : 'none';
}

function downloadExcel() {
    window.open(`php/export_excel_bays.php?project=${currentProject}&bay=${currentBay}`, '_blank');
}

function updateRawData() {
    filteredRawData = [...filterDataByBay()];
    sortColumn = null;
    sortDirection = 'asc';
    generateRawDataHeader();
    attachSortHandlers();
    renderRawDataTable();
}

function generateRawDataHeader() {
    const thead = document.getElementById('rawDataHeader');
    let headerHTML = '<tr>';
    
    headerHTML += '<th data-column="usn">USN</th>';
    headerHTML += '<th data-column="rack_pn">Rack PN</th>';
    headerHTML += '<th data-column="model">Model</th>';
    headerHTML += '<th data-column="bay">Bay</th>';
    headerHTML += '<th data-column="ip">IP</th>';
    headerHTML += '<th data-column="batch">Batch</th>';
    headerHTML += '<th data-column="current_stage">Current Stage</th>';
    headerHTML += '<th data-column="test_start_time">Test Start</th>';
    
    STAGES.forEach(stage => {
        const sl = stage.toLowerCase();
        headerHTML += `<th data-column="${sl}_pass">${stage} Pass</th>`;
        headerHTML += `<th data-column="${sl}_hours">${stage} Hrs</th>`;
    });
    
    headerHTML += '<th data-column="ultima_actualizacion">Last Update</th>';
    headerHTML += '</tr>';
    
    thead.innerHTML = headerHTML;
}

function sortByColumn(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    
    filteredRawData.sort((a, b) => {
        let valA, valB;
        
        switch(column) {
            case 'usn':
            case 'rack_pn':
            case 'model':
            case 'bay':
            case 'ip':
            case 'current_stage':
            case 'test_start_time':
            case 'ultima_actualizacion':
                valA = a[column] || '';
                valB = b[column] || '';
                break;
            case 'batch':
                const batchA = a.batch || '';
                const batchB = b.batch || '';
                const numA = parseInt(batchA.match(/\d+/)?.[0] || '0');
                const numB = parseInt(batchB.match(/\d+/)?.[0] || '0');
                valA = numA;
                valB = numB;
                break;
            default:
                if (column.includes('_pass')) {
                    const stage = column.replace('_pass', '').toUpperCase();
                    valA = a.stages[stage]?.pass || '';
                    valB = b.stages[stage]?.pass || '';
                } else if (column.includes('_hours')) {
                    const stage = column.replace('_hours', '').toUpperCase();
                    valA = a.stages[stage]?.duration_hours ?? -1;
                    valB = b.stages[stage]?.duration_hours ?? -1;
                }
        }
        
        if (typeof valA === 'number' && typeof valB === 'number') {
            return sortDirection === 'asc' ? valA - valB : valB - valA;
        } else {
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            if (sortDirection === 'asc') {
                return strA < strB ? -1 : strA > strB ? 1 : 0;
            } else {
                return strB < strA ? -1 : strB > strA ? 1 : 0;
            }
        }
    });
    
    renderRawDataTable();
    updateSortIndicators();
}

function updateSortIndicators() {
    document.querySelectorAll('#rawDataTable th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    if (sortColumn) {
        const th = document.querySelector(`#rawDataTable th[data-column="${sortColumn}"]`);
        if (th) {
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    }
}

function attachSortHandlers() {
    document.querySelectorAll('#rawDataTable th[data-column]').forEach(th => {
        th.style.cursor = 'pointer';
        th.onclick = () => sortByColumn(th.getAttribute('data-column'));
    });
}

function renderRawDataTable() {
    const tbody = document.getElementById('rawDataBody');
    
    let totalColumns = 8 + (STAGES.length * 2) + 1;
    
    if (filteredRawData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${totalColumns}" style="text-align: center; padding: 20px;">No data available</td></tr>`;
        return;
    }
    
    const rows = filteredRawData.map(d => {
        const formatHours = (h) => h !== null && h !== undefined ? h.toFixed(2) : '-';
        const formatDate = (date) => date || '-';
        
        let rowHTML = `
            <tr>
                <td>${d.usn}</td>
                <td>${d.rack_pn || '-'}</td>
                <td>${d.model || '-'}</td>
                <td>${d.bay || '-'}</td>
                <td>${d.ip || '-'}</td>
                <td>${d.batch || '-'}</td>
                <td>${d.current_stage || '-'}</td>
                <td>${formatDate(d.test_start_time)}</td>
        `;
        
        STAGES.forEach(stage => {
            rowHTML += `<td>${formatDate(d.stages[stage].pass)}</td>`;
            rowHTML += `<td class="number">${formatHours(d.stages[stage].duration_hours)}</td>`;
        });
        
        rowHTML += `<td>${formatDate(d.ultima_actualizacion)}</td></tr>`;
        
        return rowHTML;
    }).join('');
    
    tbody.innerHTML = rows;
}

function filterRawData(searchTerm) {
    searchTerm = searchTerm.toLowerCase();
    
    if (!searchTerm) {
        filteredRawData = [...filterDataByBay()];
    } else {
        filteredRawData = filterDataByBay().filter(d => {
            return d.usn.toLowerCase().includes(searchTerm) ||
                   (d.model && d.model.toLowerCase().includes(searchTerm)) ||
                   (d.bay && d.bay.toLowerCase().includes(searchTerm)) ||
                   (d.current_stage && d.current_stage.toLowerCase().includes(searchTerm)) ||
                   (d.rack_pn && d.rack_pn.toLowerCase().includes(searchTerm));
        });
    }
    
    renderRawDataTable();
    attachSortHandlers();
}

// ================================================================
// EVENT LISTENERS
// ================================================================

document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', function() {
        const newProject = this.getAttribute('data-project');
        if (newProject === currentProject) return;
        
        currentProject = newProject;
        STAGES = PROJECT_CONFIG[currentProject].stages;
        
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('pageTitle').textContent = '📊 ' + PROJECT_CONFIG[currentProject].title;
        
        // Ocultar/mostrar bay tabs según proyecto
        const bayTabsSection = document.getElementById('bayTabsSection');
        if (bayTabsSection) {
            bayTabsSection.style.display = currentProject === 'L10' ? 'block' : 'none';
        }
        
        loadData();
    });
});

document.getElementById('viewMode').addEventListener('change', updateChart);
document.getElementById('modelFilter').addEventListener('change', () => {
    updateChart();
    updateMetrics();
});
document.getElementById('metricsModelFilter').addEventListener('change', () => {
    updateMetrics();
});
document.getElementById('breakdownModelFilter').addEventListener('change', () => {
    updateChart();
});
document.getElementById('searchBox').addEventListener('input', (e) => {
    filterRawData(e.target.value);
});

// ================================================================
// INICIALIZACIÓN
// ================================================================

loadData();
