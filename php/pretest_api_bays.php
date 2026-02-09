<?php
/**
 * ============================================================
 * pretest_api_bays.php - API REST para tbl_usn_stages_bays
 * ============================================================
 * 
 * API para obtener datos de la tabla tbl_usn_stages_bays
 * que incluye información de bay e IP
 * 
 * ============================================================
 */

// Mostrar errores para debug
error_reporting(E_ALL);
ini_set('display_errors', 1);

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Manejar preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Solo GET permitido
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use GET.']);
    exit;
}

// Conexión directa a MySQL
try {
    $pdo = new PDO(
        "mysql:host=30.0.1.61;port=3306;dbname=analisys;charset=utf8mb4",
        "TEView",
        "password",
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed', 'details' => $e->getMessage()]);
    exit;
}

// Determinar proyecto (L10 o L11)
$project = isset($_GET['project']) ? strtoupper($_GET['project']) : 'L10';

// Configuración de filtros de fecha por bay
$BAY_FILTERS = [
    'BAY_11' => '2026-02-05 15:00:00',  // Thursday, Feb 5, 2026 at 3:00 PM
    'BAY_12' => '2026-02-06 16:00:00',  // Friday, Feb 6, 2026 at 4:00 PM
    'BAY_13' => '2026-02-06 16:00:00',  // Friday, Feb 6, 2026 at 4:00 PM
];

// Configuración por proyecto
$PROJECT_CONFIG = [
    'L10' => [
        'table' => 'tbl_usn_stages_bays',
        'stages' => ['TN','TO','TP','N1','N2','QN','RS','MG','MD','M1','MW','SU','BS'],
        'last_stage' => 'bs_pass'
    ],
    'L11' => [
        'table' => 'tbl_usn_stages_bays',
        'stages' => ['WT','PT','YC','WL','MG','MD','M1','MW','SU','WB','BO'],
        'last_stage' => 'bo_pass'
    ]
];

// Validar proyecto
if (!isset($PROJECT_CONFIG[$project])) {
    sendError("Invalid project. Use L10 or L11");
}

$config = $PROJECT_CONFIG[$project];
$TABLE = $config['table'];
$STAGES = $config['stages'];
$LAST_STAGE = $config['last_stage'];

// Funciones helper
function sendJSON($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function sendError($message, $status = 400) {
    sendJSON(['success' => false, 'error' => $message], $status);
}

// ================================================================
//  ROUTER
// ================================================================

// 1) Detalle de un USN específico
if (isset($_GET['usn'])) {
    getUSNDetail($pdo, $_GET['usn'], $STAGES, $TABLE);
}

// 2) Filtrar por stage actual
if (isset($_GET['stage'])) {
    filterByStage($pdo, $_GET['stage'], $STAGES, $TABLE);
}

// 3) Filtrar por modelo
if (isset($_GET['model'])) {
    filterByModel($pdo, $_GET['model'], $STAGES, $TABLE);
}

// 4) Filtrar por bay
if (isset($_GET['bay'])) {
    filterByBay($pdo, $_GET['bay'], $STAGES, $TABLE);
}

// 5) Vista resumida (summary)
if (isset($_GET['summary']) && $_GET['summary'] === 'true') {
    getSummary($pdo, $STAGES, $TABLE);
}

// 6) USNs pendientes (no completaron todos los stages)
if (isset($_GET['pending']) && $_GET['pending'] === 'true') {
    getPending($pdo, $STAGES, $TABLE);
}

// 7) USNs completados (todos los stages)
if (isset($_GET['completed']) && $_GET['completed'] === 'true') {
    getCompleted($pdo, $STAGES, $TABLE, $LAST_STAGE);
}

// 8) Default: listar todos
listAll($pdo, $STAGES, $TABLE);


// ================================================================
//  FUNCIONES
// ================================================================

/**
 * 1. Detalle completo de un USN
 */
function getUSNDetail($pdo, $usn, $stages, $table) {
    $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE usn = :usn");
    $stmt->execute(['usn' => $usn]);
    $row = $stmt->fetch();
    
    if (!$row) {
        sendError("USN not found", 404);
    }
    
    // Formatear la respuesta
    $detail = [
        'usn'                => $row['usn'],
        'rack_pn'            => $row['rack_pn'],
        'model'              => $row['model'],
        'bay'                => $row['bay'] ?? null,
        'ip'                 => $row['ip'] ?? null,
        'batch'              => $row['batch'] ?? null,
        'current_stage'      => $row['current_stage'],
        'test_start_time'    => $row['test_start_time'],
        'ultima_actualizacion' => $row['ultima_actualizacion'],
        'stages' => []
    ];
    
    // Agregar cada stage con su timestamp y duración
    foreach ($stages as $s) {
        $sl = strtolower($s);
        $detail['stages'][$s] = [
            'pass'          => $row["{$sl}_pass"],
            'duration_hours' => $row["{$sl}_duration_hours"] !== null 
                ? (float)$row["{$sl}_duration_hours"] 
                : null
        ];
    }
    
    sendJSON([
        'success' => true,
        'data' => $detail
    ]);
}

/**
 * 2. Filtrar por stage actual
 */
function filterByStage($pdo, $stage, $stages, $table) {
    global $BAY_FILTERS;
    
    $stage = strtoupper($stage);
    
    // Validar que el stage exista
    if (!in_array($stage, $stages)) {
        sendError("Invalid stage. Valid stages: " . implode(', ', $stages));
    }
    
    // Construir condiciones de fecha por bay
    $whereClauses = [];
    foreach ($BAY_FILTERS as $bay => $dateFilter) {
        $whereClauses[] = "(bay = '{$bay}' AND test_start_time >= '{$dateFilter}')";
    }
    $baysWithFilter = array_keys($BAY_FILTERS);
    $baysPlaceholder = "'" . implode("','", $baysWithFilter) . "'";
    $whereClauses[] = "(bay NOT IN ({$baysPlaceholder}))";
    $whereSQL = implode(' OR ', $whereClauses);
    
    $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE current_stage LIKE :stage AND ({$whereSQL}) ORDER BY usn");
    $stmt->execute(['stage' => "%($stage)%"]);
    $rows = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'count' => count($rows),
        'filter' => ['stage' => $stage],
        'data' => formatListResponse($rows, $stages)
    ]);
}

/**
 * 3. Filtrar por modelo
 */
function filterByModel($pdo, $model, $stages, $table) {
    global $BAY_FILTERS;
    
    // Construir condiciones de fecha por bay
    $whereClauses = [];
    foreach ($BAY_FILTERS as $bay => $dateFilter) {
        $whereClauses[] = "(bay = '{$bay}' AND test_start_time >= '{$dateFilter}')";
    }
    $baysWithFilter = array_keys($BAY_FILTERS);
    $baysPlaceholder = "'" . implode("','", $baysWithFilter) . "'";
    $whereClauses[] = "(bay NOT IN ({$baysPlaceholder}))";
    $whereSQL = implode(' OR ', $whereClauses);
    
    $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE model LIKE :model AND ({$whereSQL}) ORDER BY usn");
    $stmt->execute(['model' => "%$model%"]);
    $rows = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'count' => count($rows),
        'filter' => ['model' => $model],
        'data' => formatListResponse($rows, $stages)
    ]);
}

/**
 * 4. Filtrar por bay
 */
function filterByBay($pdo, $bay, $stages, $table) {
    global $BAY_FILTERS;
    
    // Si el bay tiene filtro específico, aplicarlo
    if (isset($BAY_FILTERS[$bay])) {
        $dateFilter = $BAY_FILTERS[$bay];
        $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE bay = :bay AND test_start_time >= :dateFilter ORDER BY usn");
        $stmt->execute(['bay' => $bay, 'dateFilter' => $dateFilter]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE bay = :bay ORDER BY usn");
        $stmt->execute(['bay' => $bay]);
    }
    
    $rows = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'count' => count($rows),
        'filter' => ['bay' => $bay],
        'data' => formatListResponse($rows, $stages)
    ]);
}

/**
 * 5. Vista resumida (solo checks)
 */
function getSummary($pdo, $stages, $table) {
    global $BAY_FILTERS;
    
    // Construir query con filtros de fecha por bay
    $whereClauses = [];
    foreach ($BAY_FILTERS as $bay => $dateFilter) {
        $whereClauses[] = "(bay = '{$bay}' AND test_start_time >= '{$dateFilter}')";
    }
    $baysWithFilter = array_keys($BAY_FILTERS);
    $baysPlaceholder = "'" . implode("','", $baysWithFilter) . "'";
    $whereClauses[] = "(bay NOT IN ({$baysPlaceholder}))";
    $whereSQL = implode(' OR ', $whereClauses);
    
    $sql = "SELECT * FROM {$table} WHERE ({$whereSQL}) ORDER BY usn";
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();
    
    $summary = [];
    foreach ($rows as $row) {
        $item = [
            'usn'           => $row['usn'],
            'model'         => $row['model'],
            'bay'           => $row['bay'] ?? null,
            'current_stage' => $row['current_stage'],
            'stages_completed' => []
        ];
        
        foreach ($stages as $s) {
            $sl = strtolower($s);
            $item['stages_completed'][$s] = $row["{$sl}_pass"] !== null;
        }
        
        $summary[] = $item;
    }
    
    sendJSON([
        'success' => true,
        'count' => count($summary),
        'data' => $summary
    ]);
}

/**
 * 6. USNs pendientes (falta al menos un stage)
 */
function getPending($pdo, $stages, $table) {
    global $BAY_FILTERS;
    
    // Construir query con filtros de fecha por bay
    $whereClauses = [];
    foreach ($BAY_FILTERS as $bay => $dateFilter) {
        $whereClauses[] = "(bay = '{$bay}' AND test_start_time >= '{$dateFilter}')";
    }
    $baysWithFilter = array_keys($BAY_FILTERS);
    $baysPlaceholder = "'" . implode("','", $baysWithFilter) . "'";
    $whereClauses[] = "(bay NOT IN ({$baysPlaceholder}))";
    $whereSQL = implode(' OR ', $whereClauses);
    
    $sql = "SELECT * FROM {$table} WHERE ({$whereSQL}) ORDER BY usn";
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();
    
    $pending = [];
    foreach ($rows as $row) {
        $missing = [];
        foreach ($stages as $s) {
            $sl = strtolower($s);
            if ($row["{$sl}_pass"] === null) {
                $missing[] = $s;
            }
        }
        
        if (!empty($missing)) {
            $pending[] = [
                'usn'           => $row['usn'],
                'model'         => $row['model'],
                'bay'           => $row['bay'] ?? null,
                'current_stage' => $row['current_stage'],
                'missing_stages' => $missing,
                'completed_count' => count($stages) - count($missing),
                'total_stages'   => count($stages)
            ];
        }
    }
    
    sendJSON([
        'success' => true,
        'count' => count($pending),
        'data' => $pending
    ]);
}

/**
 * 7. USNs completados (todos los stages)
 */
function getCompleted($pdo, $stages, $table, $last_stage) {
    global $BAY_FILTERS;
    
    // Construir query con filtros de fecha por bay
    $whereClauses = [];
    foreach ($BAY_FILTERS as $bay => $dateFilter) {
        $whereClauses[] = "(bay = '{$bay}' AND test_start_time >= '{$dateFilter}')";
    }
    $baysWithFilter = array_keys($BAY_FILTERS);
    $baysPlaceholder = "'" . implode("','", $baysWithFilter) . "'";
    $whereClauses[] = "(bay NOT IN ({$baysPlaceholder}))";
    $whereSQL = implode(' OR ', $whereClauses);
    
    $sql = "SELECT * FROM {$table} WHERE ({$whereSQL}) ORDER BY usn";
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();
    
    $completed = [];
    foreach ($rows as $row) {
        $all_done = true;
        foreach ($stages as $s) {
            $sl = strtolower($s);
            if ($row["{$sl}_pass"] === null) {
                $all_done = false;
                break;
            }
        }
        
        if ($all_done) {
            // Calcular tiempo total (last_stage - test_start_time)
            $start = $row['test_start_time'];
            $end   = $row[$last_stage];
            $total_hours = null;
            
            if ($start && $end) {
                $start_ts = strtotime($start);
                $end_ts   = strtotime($end);
                $total_hours = round(($end_ts - $start_ts) / 3600, 2);
            }
            
            $completed[] = [
                'usn'           => $row['usn'],
                'model'         => $row['model'],
                'bay'           => $row['bay'] ?? null,
                'test_start_time' => $start,
                'last_pass'     => $end,
                'total_hours'   => $total_hours
            ];
        }
    }
    
    sendJSON([
        'success' => true,
        'count' => count($completed),
        'data' => $completed
    ]);
}

/**
 * 8. Listar todos con filtros de fecha por bay
 */
function listAll($pdo, $stages, $table) {
    global $BAY_FILTERS;
    
    // Construir query con filtros de fecha por bay
    $whereClauses = [];
    foreach ($BAY_FILTERS as $bay => $dateFilter) {
        $whereClauses[] = "(bay = '{$bay}' AND test_start_time >= '{$dateFilter}')";
    }
    
    // Agregar condición para otros bays sin filtro específico
    $baysWithFilter = array_keys($BAY_FILTERS);
    $baysPlaceholder = "'" . implode("','", $baysWithFilter) . "'";
    $whereClauses[] = "(bay NOT IN ({$baysPlaceholder}))";
    
    $whereSQL = implode(' OR ', $whereClauses);
    
    $sql = "SELECT * FROM {$table} WHERE ({$whereSQL}) ORDER BY usn";
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'count' => count($rows),
        'data' => formatListResponse($rows, $stages)
    ]);
}

/**
 * Formatear respuesta de lista (incluye todos los campos)
 */
function formatListResponse($rows, $stages) {
    $result = [];
    foreach ($rows as $row) {
        $item = [
            'usn'           => $row['usn'],
            'rack_pn'       => $row['rack_pn'],
            'model'         => $row['model'],
            'bay'           => $row['bay'] ?? null,
            'ip'            => $row['ip'] ?? null,
            'batch'         => $row['batch'] ?? null,
            'current_stage' => $row['current_stage'],
            'test_start_time' => $row['test_start_time'],
            'ultima_actualizacion' => $row['ultima_actualizacion'],
            'stages' => []
        ];
        
        foreach ($stages as $s) {
            $sl = strtolower($s);
            $item['stages'][$s] = [
                'pass'          => $row["{$sl}_pass"],
                'duration_hours' => $row["{$sl}_duration_hours"] !== null 
                    ? (float)$row["{$sl}_duration_hours"] 
                    : null
            ];
        }
        
        $result[] = $item;
    }
    return $result;
}
