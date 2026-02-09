<?php
/**
 * ============================================================
 * mdaas_failures_list.php - MDaaS Failures Detail
 * ============================================================
 * 
 * Shows the list of USNs with failures found in MDaaS
 * 
 * ============================================================
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(30); // Short timeout - should be fast
header('Content-Type: text/html; charset=utf-8');

echo "<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>MDaaS Failures List</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #e74c3c;
            padding-bottom: 10px;
        }
        .summary {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .summary h2 {
            margin-top: 0;
            color: #e74c3c;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #e74c3c;
        }
        .stat-card .label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }
        .stat-card .value {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin-top: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        th {
            background: #e74c3c;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        tr:hover {
            background: #f8f9fa;
        }
        tr:last-child td {
            border-bottom: none;
        }
        .usn-code {
            font-family: 'Courier New', monospace;
            background: #f0f0f0;
            padding: 4px 8px;
            border-radius: 3px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        .usn-code:hover {
            background: #e74c3c;
            color: white;
        }
        .log-link {
            color: #3498db;
            text-decoration: none;
            font-size: 12px;
            display: inline-block;
            margin-left: 5px;
        }
        .log-link:hover {
            text-decoration: underline;
        }
        .server-info {
            font-size: 11px;
            color: #666;
            font-style: italic;
        }
        .batch-badge {
            background: #3498db;
            color: white;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
        }
        .timestamp {
            color: #666;
            font-size: 13px;
        }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #999;
            font-style: italic;
        }
        .refresh-btn {
            display: inline-block;
            background: #3498db;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            text-decoration: none;
            margin-top: 10px;
        }
        .refresh-btn:hover {
            background: #2980b9;
        }
    </style>
</head>
<body>";

echo "<h1>🔴 MDaaS Failures List</h1>";

// MySQL Connection
try {
    $mysql = new PDO(
        'mysql:host=30.0.1.61;port=3306;dbname=analisys',
        'TEView',
        'password'
    );
    $mysql->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("<div class='no-data'>MySQL Connection Failed: " . $e->getMessage() . "</div></body></html>");
}

// Read cache file
$cache_file = __DIR__ . '/mdaas_cache.json';

if (!file_exists($cache_file)) {
    echo "<div class='no-data'>";
    echo "<h2>⚠️ Cache Not Found</h2>";
    echo "<p>The MDaaS cache hasn't been generated yet.</p>";
    echo "<a href='calculate_mdaas_cache.php' class='refresh-btn'>Generate Cache Now</a>";
    echo "</div>";
    echo "</body></html>";
    exit;
}

$cache_data = json_decode(file_get_contents($cache_file), true);

if (!$cache_data || empty($cache_data['usns_list'])) {
    echo "<div class='no-data'>";
    echo "<h2>✅ No Failures Found</h2>";
    echo "<p>All USNs passed MDaaS testing without failures.</p>";
    echo "</div>";
    echo "</body></html>";
    exit;
}

$failed_usns = $cache_data['usns_list'];
$log_locations = $cache_data['log_locations'] ?? [];

// Get USN details from database
$placeholders = implode(',', array_fill(0, count($failed_usns), '?'));
$stmt = $mysql->prepare("
    SELECT usn, batch, test_start_time, tn_pass 
    FROM usn_stages 
    WHERE usn IN ($placeholders)
    ORDER BY batch, usn
");
$stmt->execute($failed_usns);
$usn_details = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Create a map for quick lookup and merge with log locations
$usn_map = [];
$total_test_failures = 0;
$failure_summary = []; // Track failures by test name

foreach ($usn_details as $detail) {
    $usn = $detail['usn'];
    $usn_map[$usn] = $detail;
    
    // Add log location info from cache
    if (isset($log_locations[$usn])) {
        $usn_map[$usn]['log_url'] = $log_locations[$usn]['log_url'];
        $usn_map[$usn]['history_url'] = $log_locations[$usn]['history_url'] ?? null;
        $usn_map[$usn]['tps_ip'] = $log_locations[$usn]['tps_ip'];
        $usn_map[$usn]['tps_remark'] = $log_locations[$usn]['remark'];
        $usn_map[$usn]['oa_ip'] = $log_locations[$usn]['oa_ip'];
        $usn_map[$usn]['failures_count'] = $log_locations[$usn]['failures_count'] ?? 0;
        $usn_map[$usn]['total_tests'] = $log_locations[$usn]['total_tests'] ?? 0;
        
        $total_test_failures += $usn_map[$usn]['failures_count'];
        
        // Parse history log to get failure details
        if (isset($log_locations[$usn]['history_url'])) {
            $history_content = @file_get_contents($log_locations[$usn]['history_url']);
            if ($history_content !== false) {
                $lines = explode("\n", $history_content);
                $failed_tests = [];
                
                foreach ($lines as $line) {
                    $line = trim($line);
                    if (empty($line)) continue;
                    if (strpos($line, 'ID') !== false && strpos($line, 'Stage') !== false) continue;
                    if (strpos($line, '---') === 0 || strpos($line, '====') === 0) continue;
                    
                    $parts = preg_split('/\s{2,}/', $line);
                    
                    if (count($parts) >= 7) {
                        $id = trim($parts[0]);
                        $stage = trim($parts[1]);
                        $name = trim($parts[2]);
                        $result = trim(strtolower($parts[count($parts) - 1]));
                        
                        if (is_numeric($id) && $result === 'fail') {
                            $failed_tests[] = [
                                'stage' => $stage,
                                'name' => $name
                            ];
                            
                            // Track failure by test name
                            $key = $stage . ' - ' . $name;
                            if (!isset($failure_summary[$key])) {
                                $failure_summary[$key] = [
                                    'stage' => $stage,
                                    'name' => $name,
                                    'count' => 0,
                                    'usns' => []
                                ];
                            }
                            $failure_summary[$key]['count']++;
                            if (!in_array($usn, $failure_summary[$key]['usns'])) {
                                $failure_summary[$key]['usns'][] = $usn;
                            }
                        }
                    }
                }
                
                $usn_map[$usn]['failed_tests'] = $failed_tests;
            }
        }
    }
}

// Sort failure summary by count (most common failures first)
uasort($failure_summary, function($a, $b) {
    return $b['count'] - $a['count'];
});

// Summary
echo "<div class='summary'>";
echo "<h2>📊 Overview Summary</h2>";
echo "<div class='stats'>";
echo "<div class='stat-card'>";
echo "<div class='label'>USNs with Failures</div>";
echo "<div class='value' style='color: #e74c3c;'>" . count($failed_usns) . "</div>";
echo "</div>";
echo "<div class='stat-card'>";
echo "<div class='label'>Total Test Failures</div>";
echo "<div class='value' style='color: #e74c3c;'>$total_test_failures</div>";
echo "</div>";
echo "<div class='stat-card'>";
echo "<div class='label'>Failure Rate</div>";
echo "<div class='value' style='color: #e74c3c;'>{$cache_data['failure_rate']}%</div>";
echo "</div>";
echo "<div class='stat-card'>";
echo "<div class='label'>Yield First Pass</div>";
echo "<div class='value' style='color: #27ae60;'>{$cache_data['yield_first_pass']}%</div>";
echo "</div>";
echo "<div class='stat-card'>";
echo "<div class='label'>Cache Updated</div>";
echo "<div class='value timestamp' style='font-size: 14px;'>{$cache_data['timestamp']}</div>";
echo "</div>";
echo "</div>";
echo "<a href='calculate_mdaas_cache.php' class='refresh-btn'>🔄 Refresh Cache</a>";
echo "</div>";

// Failure Summary by Test
if (!empty($failure_summary)) {
    echo "<div class='summary'>";
    echo "<h2>🔍 Failure Summary by Test</h2>";
    echo "<p style='color: #666; margin-bottom: 15px;'>Most common failures across all USNs</p>";
    echo "<table>";
    echo "<thead>";
    echo "<tr>";
    echo "<th>#</th>";
    echo "<th>Stage</th>";
    echo "<th>Test Name</th>";
    echo "<th>Failure Count</th>";
    echo "<th>Affected USNs</th>";
    echo "</tr>";
    echo "</thead>";
    echo "<tbody>";
    
    $rank = 1;
    foreach ($failure_summary as $key => $info) {
        echo "<tr>";
        echo "<td>$rank</td>";
        echo "<td><strong>{$info['stage']}</strong></td>";
        echo "<td>{$info['name']}</td>";
        echo "<td><span style='background: #e74c3c; color: white; padding: 4px 10px; border-radius: 12px; font-weight: bold;'>{$info['count']}</span></td>";
        echo "<td style='font-size: 11px;'>" . count($info['usns']) . " USN(s)</td>";
        echo "</tr>";
        $rank++;
        
        // Show max 10 most common failures
        if ($rank > 10) break;
    }
    
    echo "</tbody>";
    echo "</table>";
    echo "</div>";
}

// Failures table
echo "<div class='summary'>";
echo "<h2>📋 Detailed USN Failures</h2>";
echo "<table>";
echo "<thead>";
echo "<tr>";
echo "<th>#</th>";
echo "<th>USN</th>";
echo "<th>Batch</th>";
echo "<th>Failed Tests</th>";
echo "<th>Test Start Time</th>";
echo "<th>Log Location</th>";
echo "</tr>";
echo "</thead>";
echo "<tbody>";

$index = 1;
foreach ($failed_usns as $usn) {
    $details = $usn_map[$usn] ?? null;
    
    echo "<tr>";
    echo "<td>$index</td>";
    
    if ($details) {
        // USN with link to logs
        if (isset($details['log_url'])) {
            echo "<td><a href='{$details['log_url']}' target='_blank' class='usn-code' title='Click to view logs'>$usn 🔗</a></td>";
        } else {
            echo "<td><span class='usn-code'>$usn</span></td>";
        }
        
        echo "<td><span class='batch-badge'>{$details['batch']}</span></td>";
        
        // Show failure count and details
        $failures_count = $details['failures_count'] ?? 0;
        $total_tests = $details['total_tests'] ?? 0;
        echo "<td>";
        echo "<strong style='color: #e74c3c;'>$failures_count</strong> / $total_tests";
        
        // Show failed test names if available
        if (isset($details['failed_tests']) && !empty($details['failed_tests'])) {
            echo "<br><small style='color: #666;'>";
            $test_names = array_map(function($t) {
                return $t['stage'] . '-' . $t['name'];
            }, $details['failed_tests']);
            echo implode(', ', array_slice($test_names, 0, 3));
            if (count($test_names) > 3) {
                echo '...';
            }
            echo "</small>";
        }
        echo "</td>";
        
        echo "<td>{$details['test_start_time']}</td>";
        
        // Log location info
        if (isset($details['log_url'])) {
            echo "<td>";
            echo "<a href='{$details['log_url']}' target='_blank' class='log-link'>📁 View Logs</a><br>";
            if (isset($details['history_url'])) {
                echo "<a href='{$details['history_url']}' target='_blank' class='log-link'>📄 history.log</a><br>";
            }
            echo "<span class='server-info'>TPS: {$details['tps_ip']}</span><br>";
            if (!empty($details['tps_remark'])) {
                echo "<span class='server-info'>{$details['tps_remark']}</span>";
            }
            echo "</td>";
        } else {
            echo "<td><span class='server-info'>Not found</span></td>";
        }
    } else {
        echo "<td><span class='usn-code'>$usn</span></td>";
        echo "<td colspan='4' style='color: #999; font-style: italic;'>Not found in database</td>";
    }
    
    echo "</tr>";
    $index++;
}

echo "</tbody>";
echo "</table>";
echo "</div>";

echo "</body></html>";
?>
