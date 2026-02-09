<?php
/**
 * Test connection to tbl_te03_l10_pot table
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: text/html; charset=utf-8');

echo "<h1>Testing Connection to tbl_te03_l10_pot</h1>";
echo "<hr>";

// Database connection
$host = "30.0.1.61";
$port = 3306;
$dbname = "analisys";
$user = "TEView";
$password = "password";

try {
    echo "<h2>Step 1: Connecting to database...</h2>";
    $pdo = new PDO(
        "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4",
        $user,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );
    echo "✅ <strong style='color: green;'>Connected successfully!</strong><br>";
    echo "Host: $host<br>";
    echo "Database: $dbname<br><br>";
    
    // Test 1: Check if table exists
    echo "<h2>Step 2: Checking if table exists...</h2>";
    $stmt = $pdo->query("SHOW TABLES LIKE 'tbl_te03_l10_pot'");
    $table_exists = $stmt->fetch();
    
    if ($table_exists) {
        echo "✅ <strong style='color: green;'>Table 'tbl_te03_l10_pot' exists!</strong><br><br>";
    } else {
        echo "❌ <strong style='color: red;'>Table 'tbl_te03_l10_pot' does NOT exist!</strong><br><br>";
        exit;
    }
    
    // Test 2: Get table structure
    echo "<h2>Step 3: Table Structure</h2>";
    $stmt = $pdo->query("DESCRIBE tbl_te03_l10_pot");
    $columns = $stmt->fetchAll();
    
    echo "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse: collapse;'>";
    echo "<tr style='background: #4CAF50; color: white;'>";
    echo "<th>Field</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th><th>Extra</th>";
    echo "</tr>";
    
    foreach ($columns as $col) {
        echo "<tr>";
        echo "<td><strong>{$col['Field']}</strong></td>";
        echo "<td>{$col['Type']}</td>";
        echo "<td>{$col['Null']}</td>";
        echo "<td>{$col['Key']}</td>";
        echo "<td>" . ($col['Default'] ?? 'NULL') . "</td>";
        echo "<td>{$col['Extra']}</td>";
        echo "</tr>";
    }
    echo "</table><br>";
    
    // Test 3: Count records
    echo "<h2>Step 4: Record Count</h2>";
    $stmt = $pdo->query("SELECT COUNT(*) as total FROM tbl_te03_l10_pot");
    $result = $stmt->fetch();
    $total_records = $result['total'];
    
    echo "📊 <strong>Total records in table: {$total_records}</strong><br><br>";
    
    // Test 4: Get sample data (first 10 records)
    if ($total_records > 0) {
        echo "<h2>Step 5: Sample Data (First 10 records)</h2>";
        $stmt = $pdo->query("SELECT * FROM tbl_te03_l10_pot LIMIT 10");
        $rows = $stmt->fetchAll();
        
        if (!empty($rows)) {
            echo "<div style='overflow-x: auto;'>";
            echo "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse: collapse; font-size: 12px;'>";
            
            // Header
            echo "<tr style='background: #2196F3; color: white;'>";
            foreach (array_keys($rows[0]) as $column) {
                echo "<th>{$column}</th>";
            }
            echo "</tr>";
            
            // Data rows
            foreach ($rows as $row) {
                echo "<tr>";
                foreach ($row as $value) {
                    $display_value = $value ?? '<em style="color: #999;">NULL</em>';
                    echo "<td>{$display_value}</td>";
                }
                echo "</tr>";
            }
            
            echo "</table>";
            echo "</div><br>";
        }
    } else {
        echo "<h2>Step 5: Sample Data</h2>";
        echo "⚠️ <strong style='color: orange;'>Table is empty (0 records)</strong><br><br>";
    }
    
    // Test 5: Get recent records (if ultima_actualizacion exists)
    echo "<h2>Step 6: Most Recent Records</h2>";
    try {
        $stmt = $pdo->query("
            SELECT * FROM tbl_te03_l10_pot 
            ORDER BY ultima_actualizacion DESC 
            LIMIT 5
        ");
        $recent = $stmt->fetchAll();
        
        if (!empty($recent)) {
            echo "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse: collapse; font-size: 12px;'>";
            echo "<tr style='background: #FF9800; color: white;'>";
            foreach (array_keys($recent[0]) as $column) {
                echo "<th>{$column}</th>";
            }
            echo "</tr>";
            
            foreach ($recent as $row) {
                echo "<tr>";
                foreach ($row as $value) {
                    $display_value = $value ?? '<em style="color: #999;">NULL</em>';
                    echo "<td>{$display_value}</td>";
                }
                echo "</tr>";
            }
            echo "</table>";
        } else {
            echo "No recent records found.<br>";
        }
    } catch (Exception $e) {
        echo "⚠️ Could not retrieve recent records (column 'ultima_actualizacion' might not exist)<br>";
    }
    
    echo "<br><hr>";
    echo "<h2 style='color: green;'>✅ All Tests Completed Successfully!</h2>";
    
} catch (PDOException $e) {
    echo "❌ <strong style='color: red;'>Database Error:</strong><br>";
    echo "<pre style='background: #ffe6e6; padding: 10px; border: 1px solid red;'>";
    echo "Error Code: " . $e->getCode() . "\n";
    echo "Error Message: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine();
    echo "</pre>";
} catch (Exception $e) {
    echo "❌ <strong style='color: red;'>General Error:</strong><br>";
    echo "<pre style='background: #ffe6e6; padding: 10px; border: 1px solid red;'>";
    echo $e->getMessage();
    echo "</pre>";
}
?>
