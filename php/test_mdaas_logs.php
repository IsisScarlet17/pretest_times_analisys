<?php
/**
 * ============================================================
 * test_mdaas_logs.php - Test MDaaS Log Detection
 * ============================================================
 * 
 * Tests the logic for finding logs in TPS servers
 * 
 * ============================================================
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: text/html; charset=utf-8');

echo "<h1>MDaaS Log Detection Test</h1>";
echo "<hr>";

// MySQL Connection
try {
    $mysql = new PDO(
        'mysql:host=30.0.1.61;port=3306;dbname=analisys',
        'TEView',
        'password'
    );
    $mysql->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "<p style='color: green;'>✓ MySQL Connected</p>";
} catch (PDOException $e) {
    die("<p style='color: red;'>✗ MySQL Connection Failed: " . $e->getMessage() . "</p>");
}

// Get sample USNs from usn_stages
echo "<h2>1. Getting USNs from usn_stages</h2>";
$stmt = $mysql->query("SELECT usn FROM usn_stages LIMIT 10");
$usns = $stmt->fetchAll(PDO::FETCH_COLUMN);

echo "<p>Found " . count($usns) . " USNs:</p>";
echo "<ul>";
foreach ($usns as $usn) {
    echo "<li><code>$usn</code></li>";
}
echo "</ul>";

// Get TPS IPs from mapping JSON
echo "<hr>";
echo "<h2>2. Getting TPS IPs from Mapping</h2>";
$mapping_url = 'http://localhost:8080/kis/T03Mapping.json'; #TPS: 30.0.2.95 #OA: 10.250.36.73
$mapping_data = @file_get_contents($mapping_url);

if ($mapping_data === false) {
    die("<p style='color: red;'>✗ Failed to fetch mapping JSON from: $mapping_url</p>");
}

echo "<p style='color: green;'>✓ Mapping JSON fetched successfully</p>";

$mapping_json = json_decode($mapping_data, true);
$tps_ips = [];

foreach ($mapping_json as $item) {
    $project = $item['Project'] ?? '';
    if (strtolower($project) === 'mdaas' && !empty($item['TPS_IP'])) {
        $tps_ips[] = [
            'ip' => $item['TPS_IP'],
            'remark' => $item['Remark'] ?? '',
            'oa_ip' => $item['OA_IP'] ?? ''
        ];
    }
}

echo "<p>Found " . count($tps_ips) . " TPS servers for MDaaS:</p>";
echo "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse: collapse;'>";
echo "<tr><th>TPS IP</th><th>OA IP</th><th>Remark</th></tr>";
foreach ($tps_ips as $info) {
    echo "<tr>";
    echo "<td><code>{$info['ip']}</code></td>";
    echo "<td><code>{$info['oa_ip']}</code></td>";
    echo "<td>{$info['remark']}</td>";
    echo "</tr>";
}
echo "</table>";

// Check logs for each USN
echo "<hr>";
echo "<h2>3. Checking Logs on TPS Servers</h2>";

$results = [];
$usns_with_failures = 0;

foreach ($usns as $usn) {
    echo "<h3>USN: <code>$usn</code></h3>";
    $found = false;
    
    foreach ($tps_ips as $tps_info) {
        $ip = $tps_info['ip'];
        $log_url = "http://{$ip}:9862/opt/share/logs/{$usn}/";
        
        echo "<p>Checking: <a href='$log_url' target='_blank'>$log_url</a> ... ";
        
        // Set timeout for quick check
        $context = stream_context_create([
            'http' => [
                'timeout' => 3
            ]
        ]);
        
        $headers = @get_headers($log_url, 1, $context);
        
        if ($headers && strpos($headers[0], '200') !== false) {
            echo "<strong style='color: green;'>✓ FOUND</strong> on {$tps_info['remark']}</p>";
            $found = true;
            
            // Parse history log to count failures
            $history_log_url = $log_url . $usn . "_history.log";
            $failures_count = 0;
            $total_tests = 0;
            $failed_tests = [];
            
            echo "<p style='margin-left: 20px;'>Reading history log: <a href='$history_log_url' target='_blank'>$history_log_url</a> ... ";
            
            $log_content = @file_get_contents($history_log_url, false, $context);
            
            if ($log_content !== false) {
                echo "<span style='color: green;'>✓ Downloaded (" . strlen($log_content) . " bytes)</span></p>";
                
                // Parse the log file line by line
                $lines = explode("\n", $log_content);
                echo "<p style='margin-left: 20px; color: gray;'>Processing " . count($lines) . " lines...</p>";
                
                // Debug: Show first few lines
                $debug_lines = array_slice($lines, 0, 5);
                echo "<details style='margin-left: 20px;'>";
                echo "<summary style='cursor: pointer; color: blue;'>🔍 Debug: Show first 5 lines</summary>";
                echo "<pre style='background: #f5f5f5; padding: 10px; font-size: 11px;'>";
                foreach ($debug_lines as $idx => $dl) {
                    echo "Line $idx: " . htmlspecialchars($dl) . "\n";
                }
                echo "</pre>";
                echo "</details>";
                
                $parsed_count = 0;
                $skipped_count = 0;
                
                foreach ($lines as $line_num => $line) {
                    // Keep original line for display
                    $original_line = $line;
                    $line = trim($line);
                    
                    // Skip empty lines
                    if (empty($line)) {
                        $skipped_count++;
                        continue;
                    }
                    
                    // Skip headers and separator lines
                    if (strpos($line, 'ID') !== false && strpos($line, 'Stage') !== false) {
                        $skipped_count++;
                        continue;
                    }
                    if (strpos($line, '---') === 0 || strpos($line, '====') === 0) {
                        $skipped_count++;
                        continue;
                    }
                    
                    // Parse data lines - look for "fail" or "pass" at the end
                    // Format: ID Stage Name StartTime EndTime Duration Result
                    // Split by multiple spaces to get columns
                    $parts = preg_split('/\s{2,}/', $line);
                    
                    // Debug first parsed line
                    if ($parsed_count === 0 && count($parts) >= 7) {
                        echo "<details style='margin-left: 20px;'>";
                        echo "<summary style='cursor: pointer; color: blue;'>🔍 Debug: First parsed line</summary>";
                        echo "<pre style='background: #f5f5f5; padding: 10px; font-size: 11px;'>";
                        echo "Raw line: " . htmlspecialchars($line) . "\n";
                        echo "Parts count: " . count($parts) . "\n";
                        foreach ($parts as $idx => $part) {
                            echo "Part[$idx]: '" . htmlspecialchars($part) . "'\n";
                        }
                        echo "</pre>";
                        echo "</details>";
                    }
                    
                    // Should have at least 7 parts: ID, Stage, Name, StartTime, EndTime, Duration, Result
                    if (count($parts) >= 7) {
                        $id = trim($parts[0]);
                        $stage = trim($parts[1]);
                        $name = trim($parts[2]);
                        $result = trim(strtolower($parts[count($parts) - 1]));
                        
                        // Check if ID is numeric and result is pass/fail
                        if (is_numeric($id) && ($result === 'pass' || $result === 'fail')) {
                            $total_tests++;
                            $parsed_count++;
                            
                            if ($result === 'fail') {
                                $failures_count++;
                                $failed_tests[] = [
                                    'id' => $id,
                                    'stage' => $stage,
                                    'name' => $name,
                                    'line' => $line
                                ];
                            }
                        }
                    }
                }
                
                echo "<p style='margin-left: 20px; color: gray;'>Parsed $parsed_count lines, skipped $skipped_count lines</p>";
                
                if ($failures_count > 0) {
                    echo "<p style='margin-left: 20px; color: red; font-weight: bold;'>⚠ Found $failures_count FAILURES out of $total_tests tests:</p>";
                    echo "<ul style='margin-left: 40px; color: red;'>";
                    foreach ($failed_tests as $failed) {
                        echo "<li>ID {$failed['id']}: {$failed['stage']} - {$failed['name']}</li>";
                    }
                    echo "</ul>";
                } elseif ($total_tests > 0) {
                    echo "<p style='margin-left: 20px; color: green;'>✓ All $total_tests tests passed</p>";
                } else {
                    echo "<p style='margin-left: 20px; color: orange;'>⚠ No test data parsed from log file</p>";
                }
            } else {
                echo "<span style='color: orange;'>⚠ Could not download history log</span></p>";
            }
            
            $results[] = [
                'usn' => $usn,
                'found' => true,
                'ip' => $ip,
                'remark' => $tps_info['remark'],
                'url' => $log_url,
                'history_url' => $history_log_url,
                'total_tests' => $total_tests,
                'failures_count' => $failures_count,
                'failed_tests' => $failed_tests
            ];
            break; // Found, no need to check other IPs
        } else {
            echo "<span style='color: gray;'>✗ Not found</span></p>";
        }
    }
    
    if ($found) {
        // Check if this USN actually had failures
        if (isset($results[count($results) - 1]['failures_count']) && 
            $results[count($results) - 1]['failures_count'] > 0) {
            $usns_with_failures++;
        }
    } else {
        echo "<p style='color: orange;'>⚠ Not found in any TPS server</p>";
        $results[] = [
            'usn' => $usn,
            'found' => false
        ];
    }
    
    echo "<hr style='border: 1px dashed #ccc;'>";
}

// Summary
echo "<hr>";
echo "<h2>4. Summary</h2>";

// Calculate total failures
$total_failures = 0;
$total_tests_all = 0;
$usns_with_logs_found = 0;

foreach ($results as $result) {
    if ($result['found']) {
        $usns_with_logs_found++;
        if (isset($result['failures_count'])) {
            $total_failures += $result['failures_count'];
            $total_tests_all += $result['total_tests'];
        }
    }
}

echo "<table border='1' cellpadding='10' cellspacing='0' style='border-collapse: collapse; font-size: 16px;'>";
echo "<tr><th>Metric</th><th>Value</th></tr>";
echo "<tr><td>Total USNs Checked</td><td><strong>" . count($usns) . "</strong></td></tr>";
echo "<tr><td>USNs with Logs Found</td><td><strong style='color: blue;'>$usns_with_logs_found</strong></td></tr>";
echo "<tr><td>USNs with Test Failures</td><td><strong style='color: red;'>$usns_with_failures</strong></td></tr>";
echo "<tr><td>Total Tests Executed</td><td><strong>$total_tests_all</strong></td></tr>";
echo "<tr><td>Total Test Failures</td><td><strong style='color: red;'>$total_failures</strong></td></tr>";

// Calculate FR and FPY based on USNs with actual test failures
$fr = count($usns) > 0 ? round(($usns_with_failures / count($usns)) * 100, 2) : 0;
$fpy = 100 - $fr;

echo "<tr style='background-color: #fff3cd;'><td><strong>Failure Rate (FR)</strong></td><td><strong style='color: red; font-size: 18px;'>" . $fr . "%</strong></td></tr>";
echo "<tr style='background-color: #d4edda;'><td><strong>First Pass Yield (FPY)</strong></td><td><strong style='color: green; font-size: 18px;'>" . $fpy . "%</strong></td></tr>";
echo "</table>";

echo "<hr>";
echo "<h2>5. Detailed Results</h2>";
echo "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse: collapse;'>";
echo "<tr><th>USN</th><th>Found</th><th>TPS IP</th><th>Remark</th><th>Total Tests</th><th>Failures</th><th>Links</th></tr>";
foreach ($results as $result) {
    echo "<tr>";
    echo "<td><code>{$result['usn']}</code></td>";
    
    if ($result['found']) {
        echo "<td style='color: green; font-weight: bold;'>YES</td>";
        echo "<td><code>{$result['ip']}</code></td>";
        echo "<td>{$result['remark']}</td>";
        
        // Show test counts
        $total = $result['total_tests'] ?? 0;
        $fails = $result['failures_count'] ?? 0;
        
        echo "<td style='text-align: center;'>{$total}</td>";
        
        if ($fails > 0) {
            echo "<td style='text-align: center; color: red; font-weight: bold;'>{$fails}</td>";
        } else {
            echo "<td style='text-align: center; color: green;'>{$fails}</td>";
        }
        
        echo "<td>";
        echo "<a href='{$result['url']}' target='_blank'>Logs Dir</a>";
        if (isset($result['history_url'])) {
            echo " | <a href='{$result['history_url']}' target='_blank'>History</a>";
        }
        echo "</td>";
        
        // Show failed tests details
        if ($fails > 0 && !empty($result['failed_tests'])) {
            echo "</tr>";
            echo "<tr>";
            echo "<td colspan='7' style='background-color: #ffe6e6; padding: 10px;'>";
            echo "<strong>Failed Tests:</strong>";
            echo "<ul style='margin: 5px 0;'>";
            foreach ($result['failed_tests'] as $failed) {
                echo "<li>ID {$failed['id']}: <strong>{$failed['stage']}</strong> - {$failed['name']}</li>";
            }
            echo "</ul>";
            echo "</td>";
        }
    } else {
        echo "<td style='color: gray;'>NO</td>";
        echo "<td colspan='5' style='color: gray;'>-</td>";
    }
    
    echo "</tr>";
}
echo "</table>";

echo "<hr>";
echo "<p><strong>Test completed at: " . date('Y-m-d H:i:s') . "</strong></p>";
?>
