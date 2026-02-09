// ================================================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ================================================================
let allData = [];
let chart = null;
let currentProject = 'L10'; // Proyecto activo

// Configuración por proyecto
const PROJECT_CONFIG = {
    L10: {
        stages: ['TN','TO','TP','N1','N2','QN','RS','MG','MD','M1','MW','SU','BS'],
        title: 'L10 Prestest Dashboard',
        excludeUSNs: ['P123955120005012', 'P658660471634012', 'P658660470005012']
    },
    L11: {
        stages: ['WT','PT','YC','WL','MG','MD','M1','MW','SU','WB','BO'],
        title: 'L11 Prestest Dashboard',
        excludeUSNs: []
    }
};

let STAGES = PROJECT_CONFIG[currentProject].stages;
const API_URL = 'http://10.250.36.73:8080/pretest_times_analisys/php/pretest_api.php';
const QUALITY_API_URL = 'http://10.250.36.73:8080/pretest_times_analisys/php/quality_metrics.php';

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
        
        // Excluir USNs específicos si aplica
        const excludeUSNs = PROJECT_CONFIG[currentProject].excludeUSNs;
        allData = excludeUSNs.length > 0
            ? result.data.filter(d => !excludeUSNs.includes(d.usn))
            : result.data;
        
        document.getElementById('usnCount').textContent = `${allData.length} USNs`;
        
        // Poblar filtro de modelos
        populateModelFilter();
        
        // Poblar filtro de batch
        populateBatchFilter();
        
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
 * Pobla el select de modelos con los modelos únicos
 */
function populateModelFilter() {
    const models = [...new Set(allData.map(d => d.model).filter(Boolean))];
    const modelFilter = document.getElementById('modelFilter');
    modelFilter.innerHTML = '<option value="all">Todos</option>';
    models.forEach(m => {
        modelFilter.innerHTML += `<option value="${m}">${m}</option>`;
    });
}

/**
 * Poblar dropdown de filtro de batch
 */
function populateBatchFilter() {
    const batchFilter = document.getElementById('batchFilter');
    const breakdownBatchFilter = document.getElementById('breakdownBatchFilter');
    
    // Extraer batches únicos y detectar si hay USNs sin batch
    const batches = new Set();
    let hasNoBatch = false;
    
    allData.forEach(d => {
        if (d.batch) {
            // Extraer solo el número del batch
            const batchMatch = d.batch.match(/\d+/);
            const batchNumber = batchMatch ? batchMatch[0] : d.batch;
            batches.add(batchNumber);
        } else {
            hasNoBatch = true;
        }
    });
    
    // Ordenar batches numéricamente
    const sortedBatches = Array.from(batches).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b);
    });
    
    // Limpiar y repoblar ambos selectores
    batchFilter.innerHTML = '<option value="all">All Batches</option>';
    breakdownBatchFilter.innerHTML = '<option value="all">All Batches</option>';
    
    sortedBatches.forEach(batch => {
        const option1 = document.createElement('option');
        option1.value = batch;
        option1.textContent = `Batch ${batch}`;
        batchFilter.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = batch;
        option2.textContent = `Batch ${batch}`;
        breakdownBatchFilter.appendChild(option2);
    });
    
    // Agregar opción "Sin Batch" si existen USNs sin batch
    if (hasNoBatch) {
        const option1 = document.createElement('option');
        option1.value = 'none';
        option1.textContent = 'Sin Batch';
        batchFilter.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = 'none';
        option2.textContent = 'Sin Batch';
        breakdownBatchFilter.appendChild(option2);
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
    
    // Filtrar datos por modelo
    let filtered = allData;
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
 * Aplica filtros de USN y rangos de tiempo según las métricas definidas
 */
function applyMetricFilters(data) {
    // Retornar todos los datos sin filtrar
    return data;
}

/**
 * Renderiza gráfica con todos los USN (average por stage)
 */
function renderAllUSNChart(data) {
    // Aplicar filtro de batch del breakdown
    const breakdownBatchFilter = document.getElementById('breakdownBatchFilter').value;
    let filtered = data;
    
    if (breakdownBatchFilter !== 'all') {
        filtered = filtered.filter(d => {
            // Si seleccionaron "none" (Sin Batch), mostrar solo los que no tienen batch
            if (breakdownBatchFilter === 'none') {
                return !d.batch || d.batch === '' || d.batch === null;
            }
            
            // Si no tiene batch, excluir
            if (!d.batch) return false;
            
            const batchMatch = d.batch.match(/\d+/);
            const batchNumber = batchMatch ? batchMatch[0] : d.batch;
            return batchNumber === breakdownBatchFilter;
        });
    }
    
    // Aplicar filtros de USN y rangos según las métricas
    filtered = applyMetricFilters(filtered);
    
    // Calcular estadísticas por stage
    const datasets = STAGES.map(stage => {
        const durations = filtered
            .map(d => d.stages[stage].duration_hours)
            .filter(v => v !== null && v >= 0); // Filter out negative values
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
                    text: 'Average Duration per Stage',
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
 * Renderiza gráfica con breakdown por Batch (cada línea es un batch)
 */
function renderBatchChart(data) {
    // Aplicar filtros de USN y rangos según las métricas
    let filtered = applyMetricFilters(data);
    
    // Extraer número del batch y agrupar
    const batchMap = {};
    
    filtered.forEach(d => {
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
                .filter(v => v !== null && !isNaN(v) && v >= 0); // Filter negative values
            
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
                    text: 'Average Duration per Stage by Batch',
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
                .filter(v => v !== null && !isNaN(v) && v >= 0); // Filter negative values
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
    // Aplicar filtros de USN y rangos según las métricas
    let filtered = applyMetricFilters(data);
    
    // Agrupar por día basándose en rs_pass
    const byDay = {};
    
    filtered.forEach(d => {
        const rsPass = d.stages.RS.pass;
        if (!rsPass) return;
        
        const day = rsPass.split(' ')[0]; // "2026-02-02"
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(d);
    });

    const days = Object.keys(byDay).sort();
    
    // Crear dataset por cada stage
    const datasets = STAGES.map((stage, idx) => {
        const dailyAvgs = days.map(day => {
            const durations = byDay[day]
                .map(d => d.stages[stage].duration_hours)
                .filter(v => v !== null && v >= 0); // Filter negative values
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
                    text: 'Average Duration per Stage (Daily Breakdown)',
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
        // Modo: Todos los USN - mostrar estadísticas por stage
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
        
        html += `
                </tbody>
            </table>
        `;
        container.innerHTML = html;
        
    } else if (mode === 'daily') {
        // Modo: Breakdown diario - mostrar promedio por stage por día
        let html = `
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Date</th>
        `;
        
        data.forEach(item => {
            html += `<th>${item.stage}</th>`;
        });
        
        html += `
                    </tr>
                </thead>
                <tbody>
        `;
        
        labels.forEach((day, idx) => {
            html += `<tr><td class="date-cell">${day}</td>`;
            data.forEach(item => {
                const value = item.values[idx];
                html += `<td class="value-cell">${value !== null ? hoursToString(value) : '-'}</td>`;
            });
            html += `</tr>`;
        });
        
        html += `
                </tbody>
            </table>
        `;
        container.innerHTML = html;
        
    } else if (mode === 'usn') {
        // Modo: USN individual - mostrar duración por USN por stage
        let html = `
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>USN</th>
        `;
        
        data.forEach(item => {
            html += `<th>${item.stage}</th>`;
        });
        
        html += `
                    </tr>
                </thead>
                <tbody>
        `;
        
        labels.forEach((usn, idx) => {
            html += `<tr><td class="usn-cell">${usn}</td>`;
            data.forEach(item => {
                const value = item.values[idx];
                html += `<td class="value-cell">${value !== null && value !== undefined ? value.toFixed(2) + 'h' : '-'}</td>`;
            });
            html += `</tr>`;
        });
        
        html += `
                </tbody>
            </table>
        `;
        container.innerHTML = html;
        
    } else if (mode === 'batch') {
        // Modo: Batch breakdown - mostrar promedio por batch por stage
        let html = `
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Batch</th>
        `;
        
        data.forEach(item => {
            html += `<th>${item.stage}</th>`;
        });
        
        html += `
                    </tr>
                </thead>
                <tbody>
        `;
        
        labels.forEach((batch, idx) => {
            html += `<tr><td class="batch-cell">${batch}</td>`;
            data.forEach(item => {
                const value = item.values[idx];
                html += `<td class="value-cell">${value !== null && value !== undefined ? value.toFixed(2) + 'h' : '-'}</td>`;
            });
            html += `</tr>`;
        });
        
        html += `
                </tbody>
            </table>
        `;
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
    const batchFilter = document.getElementById('batchFilter').value;
    let filtered = allData;
    
    // Filtrar por modelo
    if (modelFilter !== 'all') {
        filtered = filtered.filter(d => d.model === modelFilter);
    }
    
    // Filtrar por batch
    if (batchFilter !== 'all') {
        filtered = filtered.filter(d => {
            // Si seleccionaron "none" (Sin Batch), mostrar solo los que no tienen batch
            if (batchFilter === 'none') {
                return !d.batch || d.batch === '' || d.batch === null;
            }
            
            // Si no tiene batch, excluir
            if (!d.batch) return false;
            
            const batchMatch = d.batch.match(/\d+/);
            const batchNumber = batchMatch ? batchMatch[0] : d.batch;
            return batchNumber === batchFilter;
        });
    }

    // Calcular métricas según el proyecto
    let env1, env2, env3, total;
    let env1Name, env2Name, env3Name;
    
    if (currentProject === 'L10') {
        // L10: PRETEST, MDaaS, BSL
        env1Name = 'PRETEST';
        env2Name = 'MDaaS';
        env3Name = 'BSL';
        
        // USNs excluidos de métricas de PRETEST L10
        const excludedPretestUSNs = [
            'P675460431063012',
            'P658660641055012',
            'P658660640914012',
            'P658660641168012',
            'P658660641165012',
            'P658660640918012'
        ];
        
        env1 = [];    // RS_pass - test_start_time
        env2 = [];    // SU_pass - RS_pass
        env3 = [];    // BS_pass - SU_pass
        total = [];   // BS_pass - test_start_time

        filtered.forEach(d => {
            if (!d.stages) return;
            
            // Excluir USNs específicos de todas las métricas de L10
            if (excludedPretestUSNs.includes(d.usn)) return;
            
            const testStart = d.test_start_time;
            const rsPass = d.stages.RS?.pass;
            const suPass = d.stages.SU?.pass;
            const bsPass = d.stages.BS?.pass;

            // PRETEST: test_start_time → rs_pass
            if (testStart && rsPass) {
                const hours = (new Date(rsPass) - new Date(testStart)) / (1000 * 60 * 60);
                env1.push(hours);
            }

            // MDaaS: rs_pass → su_pass
            if (rsPass && suPass) {
                const hours = (new Date(suPass) - new Date(rsPass)) / (1000 * 60 * 60);
                if (hours >= 0) {
                    env2.push(hours);
                }
            }

            // BSL: su_pass → bs_pass
            if (suPass && bsPass) {
                const hours = (new Date(bsPass) - new Date(suPass)) / (1000 * 60 * 60);
                if (hours >= 0) {
                    env3.push(hours);
                }
            }

            // Total: test_start_time → bs_pass
            if (testStart && bsPass) {
                const hours = (new Date(bsPass) - new Date(testStart)) / (1000 * 60 * 60);
                total.push(hours);
            }
        });
        
    } else if (currentProject === 'L11') {
        // L11: L11 PoT, MDaaS, BSL
        env1Name = 'L11 PoT';
        env2Name = 'MDaaS';
        env3Name = 'BSL';
        
        env1 = [];    // YC_pass - WT_pass
        env2 = [];    // SU_pass - WL_pass
        env3 = [];    // BO_pass - WB_pass
        total = [];   // BO_pass - WT_pass

        filtered.forEach(d => {
            if (!d.stages) return;

            // L11 PoT: Suma de WT + PT + YC
            const wtHours = d.stages.WT?.duration_hours || 0;
            const ptHours = d.stages.PT?.duration_hours || 0;
            const ycHours = d.stages.YC?.duration_hours || 0;
            const hours = wtHours + ptHours + ycHours;
            if (hours > 0) {
                env1.push(hours);
            }

            // MDaaS: Suma de WL + MG + MD + M1 + MW + SU
            const wlHours = d.stages.WL?.duration_hours || 0;
            const mgHours = d.stages.MG?.duration_hours || 0;
            const mdHours = d.stages.MD?.duration_hours || 0;
            const m1Hours = d.stages.M1?.duration_hours || 0;
            const mwHours = d.stages.MW?.duration_hours || 0;
            const suHours = d.stages.SU?.duration_hours || 0;
            const hoursEnv2 = wlHours + mgHours + mdHours + m1Hours + mwHours + suHours;
            if (hoursEnv2 > 0) {
                env2.push(hoursEnv2);
            }

            // BSL: Suma de WB + BO
            const wbHours = d.stages.WB?.duration_hours || 0;
            const boHours = d.stages.BO?.duration_hours || 0;
            const hoursEnv3 = wbHours + boHours;
            if (hoursEnv3 > 0) {
                env3.push(hoursEnv3);
            }

            // Total: Suma de todos los stages WT → BO (reutilizar variables ya declaradas)
            const totalHours = wtHours + ptHours + ycHours + wlHours + mgHours + mdHours + m1Hours + mwHours + suHours + wbHours + boHours;
            if (totalHours > 0) {
                total.push(totalHours);
            }
        });
    }

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
    
    // Cargar métricas de calidad solo en L10
    if (currentProject === 'L10') {
        document.getElementById('qualityMetricsSection').style.display = 'block';
        loadQualityMetrics(filtered);
    } else {
        document.getElementById('qualityMetricsSection').style.display = 'none';
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
            <h3 style="color: ${color}">
                ${name}
            </h3>
            <div class="stat-grid">
                <div class="stat-item highlight-avg">
                    <div class="stat-label">Average</div>
                    <div class="stat-value stat-value-avg">${hoursToString(stats.avg)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">P50</div>
                    <div class="stat-value">${hoursToString(stats.p50)}</div>
                </div>
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
// QUALITY METRICS
// ================================================================

/**
 * Carga métricas de calidad desde PostgreSQL
 */
async function loadQualityMetrics(data) {
    const qualityContainer = document.getElementById('qualityMetrics');
    
    if (!data || data.length === 0) {
        qualityContainer.innerHTML = '<p style="color: #95a5a6;">No data available</p>';
        return;
    }
    
    // Mostrar loading
    qualityContainer.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            Loading quality metrics...
        </div>
    `;
    
    try {
        // Obtener lista de USNs
        const usns = data.map(d => d.usn);
        
        // Llamar a la API
        const response = await fetch(QUALITY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ usns: usns })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            qualityContainer.innerHTML = `<p style="color: #e74c3c;">Error: ${result.error}</p>`;
            return;
        }
        
        const pretest = result.data.pretest;
        const mdaas = result.data.mdaas;
        
        // Renderizar métricas - Pretest y MDaaS
        qualityContainer.innerHTML = `
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
        qualityContainer.innerHTML = `<p style="color: #e74c3c;">Failed to load quality metrics</p>`;
    }
}

// ================================================================
// RAW DATA TABLE
// ================================================================

let rawDataVisible = true;
let filteredRawData = [];
let sortColumn = null;
let sortDirection = 'asc';

/**
 * Toggle mostrar/ocultar tabla de raw data
 */
function toggleRawData() {
    rawDataVisible = !rawDataVisible;
    const container = document.getElementById('rawDataContainer');
    container.style.display = rawDataVisible ? 'block' : 'none';
}

/**
 * Download Excel with current project
 */
function downloadExcel() {
    window.open(`php/export_excel.php?project=${currentProject}`, '_blank');
}

/**
 * Actualiza la tabla de raw data
 */
function updateRawData() {
    // Los datos ya están filtrados en loadData()
    filteredRawData = [...allData];
    sortColumn = null;
    sortDirection = 'asc';
    generateRawDataHeader();
    attachSortHandlers(); // Agregar handlers después de generar el header
    renderRawDataTable();
}

/**
 * Genera el header dinámico de la tabla raw data según el proyecto
 */
function generateRawDataHeader() {
    const thead = document.getElementById('rawDataHeader');
    let headerHTML = '<tr>';
    
    // Columnas fijas
    headerHTML += '<th data-column="usn">USN</th>';
    headerHTML += '<th data-column="rack_pn">Rack PN</th>';
    headerHTML += '<th data-column="model">Model</th>';
    headerHTML += '<th data-column="batch">Batch</th>';
    headerHTML += '<th data-column="current_stage">Current Stage</th>';
    
    // Test Start solo en L10
    if (currentProject === 'L10') {
        headerHTML += '<th data-column="test_start_time">Test Start</th>';
    }
    
    // Columnas dinámicas por stage
    STAGES.forEach(stage => {
        const sl = stage.toLowerCase();
        headerHTML += `<th data-column="${sl}_pass">${stage} Pass</th>`;
        
        // En L11, omitir WT Hrs
        if (!(currentProject === 'L11' && stage === 'WT')) {
            headerHTML += `<th data-column="${sl}_hours">${stage} Hrs</th>`;
        }
    });
    
    // Columna final
    headerHTML += '<th data-column="ultima_actualizacion">Last Update</th>';
    headerHTML += '</tr>';
    
    thead.innerHTML = headerHTML;
}

/**
 * Ordena los datos por columna
 */
function sortByColumn(column) {
    // Si es la misma columna, alternar dirección
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    
    filteredRawData.sort((a, b) => {
        let valA, valB;
        
        // Obtener valores según el tipo de columna
        switch(column) {
            case 'usn':
                valA = a.usn || '';
                valB = b.usn || '';
                break;
            case 'rack_pn':
                valA = a.rack_pn || '';
                valB = b.rack_pn || '';
                break;
            case 'model':
                valA = a.model || '';
                valB = b.model || '';
                break;
            case 'batch':
                // Extraer número del batch para ordenar numéricamente
                const batchA = a.batch || '';
                const batchB = b.batch || '';
                const numA = parseInt(batchA.match(/\d+/)?.[0] || '0');
                const numB = parseInt(batchB.match(/\d+/)?.[0] || '0');
                valA = numA;
                valB = numB;
                break;
            case 'current_stage':
                valA = a.current_stage || '';
                valB = b.current_stage || '';
                break;
            case 'test_start_time':
                valA = a.test_start_time || '';
                valB = b.test_start_time || '';
                break;
            case 'ultima_actualizacion':
                valA = a.ultima_actualizacion || '';
                valB = b.ultima_actualizacion || '';
                break;
            default:
                // Para stages: formato "tn_pass" o "tn_hours"
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
        
        // Comparar valores
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

/**
 * Actualiza los indicadores visuales de ordenamiento
 */
function updateSortIndicators() {
    // Remover todos los indicadores
    document.querySelectorAll('#rawDataTable th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Agregar indicador a la columna activa
    if (sortColumn) {
        const th = document.querySelector(`#rawDataTable th[data-column="${sortColumn}"]`);
        if (th) {
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    }
}

/**
 * Adjunta handlers de click a los headers
 */
function attachSortHandlers() {
    document.querySelectorAll('#rawDataTable th[data-column]').forEach(th => {
        th.style.cursor = 'pointer';
        th.onclick = () => sortByColumn(th.getAttribute('data-column'));
    });
}

/**
 * Renderiza la tabla de raw data
 */
function renderRawDataTable() {
    const tbody = document.getElementById('rawDataBody');
    
    // Calcular número total de columnas
    let totalColumns = 5 + (STAGES.length * 2) + 1; // base: 5 fijas + stages*2 + 1 final
    if (currentProject === 'L10') {
        totalColumns += 1; // Test Start
    }
    if (currentProject === 'L11') {
        totalColumns -= 1; // Quitar WT Hrs
    }
    
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
                <td>${d.batch || '-'}</td>
                <td>${d.current_stage || '-'}</td>
        `;
        
        // Test Start solo en L10
        if (currentProject === 'L10') {
            rowHTML += `<td>${formatDate(d.test_start_time)}</td>`;
        }
        
        // Agregar columnas dinámicas por stage
        STAGES.forEach(stage => {
            rowHTML += `<td>${formatDate(d.stages[stage].pass)}</td>`;
            
            // En L11, omitir WT Hrs
            if (!(currentProject === 'L11' && stage === 'WT')) {
                rowHTML += `<td class="number">${formatHours(d.stages[stage].duration_hours)}</td>`;
            }
        });
        
        // Columna final
        rowHTML += `
                <td>${formatDate(d.ultima_actualizacion)}</td>
            </tr>
        `;
        
        return rowHTML;
    }).join('');
    
    tbody.innerHTML = rows;
}

/**
 * Filtrar raw data por búsqueda
 */
function filterRawData(searchTerm) {
    searchTerm = searchTerm.toLowerCase();
    
    if (!searchTerm) {
        // Los datos ya están filtrados en loadData()
        filteredRawData = [...allData];
    } else {
        filteredRawData = allData.filter(d => {
            return d.usn.toLowerCase().includes(searchTerm) ||
                   (d.model && d.model.toLowerCase().includes(searchTerm)) ||
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

// Project Tabs
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', function() {
        // Cambiar proyecto activo
        const newProject = this.getAttribute('data-project');
        if (newProject === currentProject) return;
        
        currentProject = newProject;
        STAGES = PROJECT_CONFIG[currentProject].stages;
        
        // Actualizar UI
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('pageTitle').textContent = '📊 ' + PROJECT_CONFIG[currentProject].title;
        
        // Recargar datos
        loadData();
    });
});

// Cambio de vista (todos los USN vs breakdown diario)
document.getElementById('viewMode').addEventListener('change', updateChart);

// Cambio de filtro de modelo
document.getElementById('modelFilter').addEventListener('change', () => {
    updateChart();
    updateMetrics();
});

// Cambio de filtro de batch en Environment Metrics
document.getElementById('batchFilter').addEventListener('change', () => {
    updateMetrics();
});

// Cambio de filtro de batch en Data Breakdown
document.getElementById('breakdownBatchFilter').addEventListener('change', () => {
    updateChart();
});

// Búsqueda en raw data
document.getElementById('searchBox').addEventListener('input', (e) => {
    filterRawData(e.target.value);
});

// ================================================================
// EXPORT TO EXCEL
// ================================================================

/**
 * Exporta la tabla de Data Breakdown a Excel (CSV)
 */
function exportBreakdownToExcel() {
    const table = document.querySelector('#breakdownTable table');
    
    if (!table) {
        alert('No hay datos para exportar');
        return;
    }
    
    // Obtener información del filtro actual
    const viewMode = document.getElementById('viewMode').value;
    const batchFilter = document.getElementById('breakdownBatchFilter').value;
    const modelFilter = document.getElementById('modelFilter').value;
    
    let filename = `breakdown_${currentProject}_`;
    
    if (viewMode === 'all') {
        filename += 'all_usns';
    } else if (viewMode === 'daily') {
        filename += 'daily';
    } else if (viewMode === 'batch') {
        filename += 'by_batch';
    }
    
    if (batchFilter !== 'all') {
        filename += `_batch_${batchFilter}`;
    }
    
    if (modelFilter !== 'all') {
        filename += `_${modelFilter}`;
    }
    
    filename += `_${new Date().toISOString().split('T')[0]}.csv`;
    
    // Convertir tabla a CSV
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        
        cols.forEach(col => {
            // Limpiar el texto y escapar comillas
            let text = col.textContent.trim();
            text = text.replace(/"/g, '""'); // Escapar comillas dobles
            rowData.push(`"${text}"`);
        });
        
        csv.push(rowData.join(','));
    });
    
    // Crear el archivo y descargarlo
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// ================================================================
// INICIALIZACIÓN
// ================================================================

// Cargar datos al cargar la página
loadData();