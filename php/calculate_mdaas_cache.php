<?php
/**
 * ============================================================
 * calculate_mdaas_cache.php - Pre-calculate MDaaS Metrics
 * ============================================================
 * 
 * Calculates MDaaS metrics and saves to JSON cache
 * Run this periodically (e.g., every 30 minutes via cron/task scheduler)
 * 
 * Usage: 
 *   Manual: php calculate_mdaas_cache.php
 *   Browser: http://localhost/pretest_times_analisys/php/calculate_mdaas_cache.php
 *   Scheduled: Create a Windows Task or cron job
 * 
 * ============================================================
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(0); // No limit - can take a while

$start_time = microtime(true);

// Check if running from command line or browser
$is_cli = php_sapi_name() === 'cli';

if (!$is_cli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<h1>Calculating MDaaS Metrics Cache</h1><hr>";
    echo "<p>Started at: " . date('Y-m-d H:i:s') . "</p>";
    flush();
}

// MySQL Connection
try {
    $mysql = new PDO(
        'mysql:host=30.0.1.61;port=3306;dbname=analisys',
        'TEView',
        'password'
    );
    $mysql->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    if (!$is_cli) echo "<p style='color: green;'>✓ MySQL Connected</p>";
} catch (PDOException $e) {
    $error = "MySQL Connection Failed: " . $e->getMessage();
    if ($is_cli) {
        echo $error . "\n";
    } else {
        echo "<p style='color: red;'>✗ $error</p>";
    }
    exit(1);
}

// Get all USNs from usn_stages
$stmt = $mysql->query("SELECT DISTINCT usn FROM usn_stages ORDER BY usn");
$usns = $stmt->fetchAll(PDO::FETCH_COLUMN);

if (!$is_cli) {
    echo "<p>Found <strong>" . count($usns) . "</strong> USNs to check</p>";
    flush();
}

// Get TPS IPs from mapping JSON
$mapping_url = 'http://localhost:8080/kis/T03Mapping.json'; #TPS: 30.0.2.95 #OA: 10.250.36.73
$mapping_data = @file_get_contents($mapping_url);

if ($mapping_data === false) {
    $error = "Failed to fetch mapping JSON";
    if ($is_cli) {
        echo $error . "\n";
    } else {
        echo "<p style='color: red;'>✗ $error</p>";
    }
    exit(1);
}

$mapping_json = json_decode($mapping_data, true);
$tps_ips = [];
$tps_info_map = []; // Store TPS info for later use

foreach ($mapping_json as $item) {
    $project = $item['Project'] ?? '';
    if (strtolower($project) === 'mdaas' && !empty($item['TPS_IP'])) {
        $ip = $item['TPS_IP'];
        $tps_ips[] = $ip;
        $tps_info_map[$ip] = [
            'remark' => $item['Remark'] ?? '',
            'oa_ip' => $item['OA_IP'] ?? ''
        ];
    }
}

if (!$is_cli) {
    echo "<p>Found <strong>" . count($tps_ips) . "</strong> TPS servers for MDaaS</p>";
    echo "<p>Checking logs for each USN using parallel requests... (this may take a while)</p>";
    flush();
}

// Check logs for each USN using curl_multi for parallel requests
$usns_with_logs = [];
$usn_log_locations = []; // Store where each USN was found
$checked_count = 0;
$batch_size = 50; // Process USNs in batches for parallel requests

for ($i = 0; $i < count($usns); $i += $batch_size) {
    $batch_usns = array_slice($usns, $i, $batch_size);
    
    // Create multi-curl handle for checking directory existence
    $mh = curl_multi_init();
    $curl_handles = [];
    
    // Build all URLs for this batch
    foreach ($batch_usns as $usn) {
        foreach ($tps_ips as $ip) {
            $log_url = "http://{$ip}:9862/opt/share/logs/{$usn}/";
            
            $ch = curl_init($log_url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_NOBODY, true); // HEAD request only
            curl_setopt($ch, CURLOPT_TIMEOUT, 2);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 1);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
            
            curl_multi_add_handle($mh, $ch);
            $curl_handles[] = ['handle' => $ch, 'usn' => $usn, 'url' => $log_url, 'ip' => $ip];
        }
    }
    
    // Execute all requests in parallel
    $running = null;
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh);
    } while ($running > 0);
    
    // Check results and verify history.log for failures
    $found_usns = [];
    foreach ($curl_handles as $info) {
        $ch = $info['handle'];
        $usn = $info['usn'];
        $ip = $info['ip'];
        $url = $info['url'];
        
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if ($http_code == 200 && !in_array($usn, $found_usns)) {
            // Found the log directory, now check {USN}_history.log for actual failures
            $history_url = $url . $usn . "_history.log";
            $history_content = @file_get_contents($history_url);
            
            if ($history_content !== false) {
                // Parse the history log to find actual test failures
                $has_failure = false;
                $failures_count = 0;
                $total_tests = 0;
                
                $lines = explode("\n", $history_content);
                
                foreach ($lines as $line) {
                    $line = trim($line);
                    
                    // Skip empty lines and headers
                    if (empty($line)) continue;
                    if (strpos($line, 'ID') !== false && strpos($line, 'Stage') !== false) continue;
                    if (strpos($line, '---') === 0 || strpos($line, '====') === 0) continue;
                    
                    // Parse data lines - split by multiple spaces
                    $parts = preg_split('/\s{2,}/', $line);
                    
                    // Should have at least 7 parts: ID, Stage, Name, StartTime, EndTime, Duration, Result
                    if (count($parts) >= 7) {
                        $id = trim($parts[0]);
                        $result = trim(strtolower($parts[count($parts) - 1]));
                        
                        // Check if ID is numeric and result is pass/fail
                        if (is_numeric($id) && ($result === 'pass' || $result === 'fail')) {
                            $total_tests++;
                            
                            if ($result === 'fail') {
                                $failures_count++;
                                $has_failure = true;
                            }
                        }
                    }
                }
                
                if ($has_failure) {
                    $found_usns[] = $usn;
                    if (!in_array($usn, $usns_with_logs)) {
                        $usns_with_logs[] = $usn;
                        // Store the location info
                        $usn_log_locations[$usn] = [
                            'tps_ip' => $ip,
                            'log_url' => $url,
                            'history_url' => $history_url,
                            'remark' => $tps_info_map[$ip]['remark'] ?? '',
                            'oa_ip' => $tps_info_map[$ip]['oa_ip'] ?? '',
                            'total_tests' => $total_tests,
                            'failures_count' => $failures_count
                        ];
                    }
                }
            }
        }
        
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    
    curl_multi_close($mh);
    
    $checked_count += count($batch_usns);
    
    // Progress update
    if (!$is_cli) {
        echo "<p>Progress: $checked_count / " . count($usns) . " USNs checked... (Found " . count($usns_with_logs) . " with logs)</p>";
        flush();
    }
}

// Calculate metrics
$total_usns = count($usns);
$usns_with_logs_count = count($usns_with_logs);
$failure_rate = $total_usns > 0 ? ($usns_with_logs_count / $total_usns) * 100 : 0;
$yield_first_pass = 100 - $failure_rate;

// Prepare cache data
$cache_data = [
    'timestamp' => date('Y-m-d H:i:s'),
    'total_usns' => $total_usns,
    'usns_with_logs' => $usns_with_logs_count,
    'failure_rate' => round($failure_rate, 2),
    'yield_first_pass' => round($yield_first_pass, 2),
    'usns_list' => $usns_with_logs, // Store which USNs have logs
    'log_locations' => $usn_log_locations, // Store where each USN was found
    'calculation_time_seconds' => round(microtime(true) - $start_time, 2)
];

// Save to JSON file
$cache_file = __DIR__ . '/mdaas_cache.json';
$json_result = file_put_contents($cache_file, json_encode($cache_data, JSON_PRETTY_PRINT));

if ($json_result === false) {
    $error = "Failed to write cache file";
    if ($is_cli) {
        echo $error . "\n";
    } else {
        echo "<p style='color: red;'>✗ $error</p>";
    }
    exit(1);
}

$end_time = microtime(true);
$elapsed = round($end_time - $start_time, 2);

// Output results
if ($is_cli) {
    echo "✓ Cache updated successfully\n";
    echo "Total USNs: $total_usns\n";
    echo "USNs with logs: $usns_with_logs_count\n";
    echo "Failure Rate: {$cache_data['failure_rate']}%\n";
    echo "Yield First Pass: {$cache_data['yield_first_pass']}%\n";
    echo "Calculation time: {$elapsed}s\n";
    echo "Cache saved to: $cache_file\n";
} else {
    echo "<hr>";
    echo "<h2>✓ Cache Updated Successfully</h2>";
    echo "<table border='1' cellpadding='10' cellspacing='0' style='border-collapse: collapse; margin-top: 20px;'>";
    echo "<tr><th>Metric</th><th>Value</th></tr>";
    echo "<tr><td>Total USNs</td><td><strong>$total_usns</strong></td></tr>";
    echo "<tr><td>USNs with Logs (Failures)</td><td><strong style='color: red;'>$usns_with_logs_count</strong></td></tr>";
    echo "<tr><td>Failure Rate</td><td><strong>{$cache_data['failure_rate']}%</strong></td></tr>";
    echo "<tr><td>Yield First Pass</td><td><strong style='color: green;'>{$cache_data['yield_first_pass']}%</strong></td></tr>";
    echo "<tr><td>Calculation Time</td><td><strong>{$elapsed}s</strong></td></tr>";
    echo "<tr><td>Cache File</td><td><code>$cache_file</code></td></tr>";
    echo "<tr><td>Timestamp</td><td>{$cache_data['timestamp']}</td></tr>";
    echo "</table>";
    
    echo "<hr>";
    echo "<p><a href='quality_metrics.php'>Test quality_metrics.php (it will now use cache)</a></p>";
}
