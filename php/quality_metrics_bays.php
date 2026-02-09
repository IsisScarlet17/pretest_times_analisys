<?php
/**
 * ============================================================
 * quality_metrics_bays.php - Quality Metrics API for Bays
 * ============================================================
 * 
 * Calculates Failure Rate and Yield First Pass
 * from PostgreSQL Reporting database for Bays analysis
 * 
 * ============================================================
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Handle preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only GET/POST allowed
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'])) {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use GET or POST.']);
    exit;
}

// Get USNs list from POST or GET
$usns = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $usns = $input['usns'] ?? [];
} else {
    $usns = isset($_GET['usns']) ? explode(',', $_GET['usns']) : [];
}

if (empty($usns)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No USNs provided']);
    exit;
}

// PostgreSQL Connection
try {
    $pg = pg_connect("host=wymxpgpdb01.c4fcfvfihivj.us-west-2.rds.amazonaws.com port=5432 dbname=wymxpgpdb01 user=ACPBIP2BVZ000 password=rG2ljS34wL0Q");
    
    if (!$pg) {
        throw new Exception("PostgreSQL connection failed");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed', 'details' => $e->getMessage()]);
    exit;
}

// Build IN clause for query
$usn_placeholders = [];
$usn_values = [];
for ($i = 0; $i < count($usns); $i++) {
    $usn_placeholders[] = '$' . ($i + 1);
    $usn_values[] = $usns[$i];
}
$usn_in_clause = implode(',', $usn_placeholders);

// Query for INFO records (excluding failures and Wait records)
$query = "
SELECT \"USN\", \"INFONAME\", \"INFOVALUE\", \"TRNDATE\"
FROM \"Reporting\".\"SFCUSNINFO_SFCFA\"  
WHERE \"INFONAME\" LIKE '%INFO%' 
  AND \"INFONAME\" NOT LIKE '%INFO_FAIL%'
  AND \"INFOVALUE\" NOT LIKE '%Wait%'
  AND \"USN\" IN ($usn_in_clause)
ORDER BY \"USN\", \"TRNDATE\"
";

$result = pg_query_params($pg, $query, $usn_values);

if (!$result) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Query failed', 'details' => pg_last_error($pg)]);
    pg_close($pg);
    exit;
}

// Fetch all rows
$rows = pg_fetch_all($result);
pg_close($pg);

// Initialize default values
$total_usns = count($usns);
$usns_with_info = 0;
$total_info_records = 0;
$failure_rate = 0;
$yield_first_pass = 100;

// Calculate metrics if we have rows
if (!empty($rows)) {
    $usn_info_count = [];
    foreach ($rows as $row) {
        $usn = $row['USN'];
        if (!isset($usn_info_count[$usn])) {
            $usn_info_count[$usn] = 0;
        }
        $usn_info_count[$usn]++;
    }

    $usns_with_info = count($usn_info_count);
    $total_info_records = count($rows);

    // Failure Rate: (USNs with INFO records / Total USNs) * 100
    $failure_rate = $total_usns > 0 ? ($usns_with_info / $total_usns) * 100 : 0;

    // Yield First Pass: 100 - Failure Rate
    $yield_first_pass = 100 - $failure_rate;
}

// ============================================================
// MDaaS Quality Metrics - Read from cache or calculate
// ============================================================
$mdaas_usns_with_logs = 0;
$mdaas_failure_rate = 0;
$mdaas_yield_first_pass = 100;

// Try to read from cache first
$cache_file = __DIR__ . '/mdaas_cache.json';
$use_cache = false;

if (file_exists($cache_file)) {
    $cache_data = json_decode(file_get_contents($cache_file), true);
    
    // Check if cache is recent (less than 30 minutes old)
    if ($cache_data && isset($cache_data['timestamp'])) {
        $cache_time = strtotime($cache_data['timestamp']);
        $current_time = time();
        $cache_age_minutes = ($current_time - $cache_time) / 60;
        
        // Use cache if less than 30 minutes old
        if ($cache_age_minutes < 30) {
            // Filter cache data for current USNs
            $current_usns_with_logs = array_intersect($usns, $cache_data['usns_list'] ?? []);
            $mdaas_usns_with_logs = count($current_usns_with_logs);
            $mdaas_failure_rate = $total_usns > 0 ? ($mdaas_usns_with_logs / $total_usns) * 100 : 0;
            $mdaas_yield_first_pass = 100 - $mdaas_failure_rate;
            $use_cache = true;
        }
    }
}

// If cache not available or too old, calculate in real-time (fallback)
if (!$use_cache) {
    try {
        $mapping_url = 'http://localhost:8080/kis/T03Mapping.json'; #TPS: 30.0.2.95 #OA: 10.250.36.73
        $mapping_data = @file_get_contents($mapping_url);
        
        if ($mapping_data !== false) {
            $mapping_json = json_decode($mapping_data, true);
            $tps_ips = [];
            
            foreach ($mapping_json as $item) {
                $project = $item['Project'] ?? '';
                if (strtolower($project) === 'mdaas' && !empty($item['TPS_IP'])) {
                    $tps_ips[] = $item['TPS_IP'];
                }
            }
            
            if (!empty($tps_ips)) {
                foreach ($usns as $usn) {
                    $found = false;
                    foreach ($tps_ips as $ip) {
                        $log_url = "http://{$ip}:9862/opt/share/logs/{$usn}/";
                        $headers = @get_headers($log_url, 1);
                        if ($headers && strpos($headers[0], '200') !== false) {
                            $found = true;
                            break;
                        }
                    }
                    if ($found) {
                        $mdaas_usns_with_logs++;
                    }
                }
                
                $mdaas_failure_rate = $total_usns > 0 ? ($mdaas_usns_with_logs / $total_usns) * 100 : 0;
                $mdaas_yield_first_pass = 100 - $mdaas_failure_rate;
            }
        }
    } catch (Exception $e) {
        // If MDaaS check fails, continue with default values (0 failures)
    }
}

echo json_encode([
    'success' => true,
    'data' => [
        'pretest' => [
            'total_usns' => $total_usns,
            'usns_with_info' => $usns_with_info,
            'info_records' => $total_info_records,
            'failure_rate' => round($failure_rate, 2),
            'yield_first_pass' => round($yield_first_pass, 2)
        ],
        'mdaas' => [
            'total_usns' => $total_usns,
            'usns_with_logs' => $mdaas_usns_with_logs,
            'failure_rate' => round($mdaas_failure_rate, 2),
            'yield_first_pass' => round($mdaas_yield_first_pass, 2)
        ]
    ]
]);
