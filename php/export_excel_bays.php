<?php
/**
 * ============================================================
 * export_excel_bays.php - Export bays stages to Excel
 * ============================================================
 * 
 * Generates an Excel file with all data from tbl_usn_stages_bays
 * table with formatting and styles
 * 
 * ============================================================
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

// Determine project (L10 or L11)
$project = isset($_GET['project']) ? strtoupper($_GET['project']) : 'L10';
$bay = isset($_GET['bay']) ? $_GET['bay'] : 'all';

// Project configuration
$PROJECT_CONFIG = [
    'L10' => [
        'table' => 'tbl_usn_stages_bays',
        'stages' => ['TN','TO','TP','N1','N2','QN','RS','MG','MD','M1','MW','SU','BS']
    ],
    'L11' => [
        'table' => 'tbl_usn_stages_bays',
        'stages' => ['WT','PT','YC','WL','MG','MD','M1','MW','SU','WB','BO']
    ]
];

// Validate project
if (!isset($PROJECT_CONFIG[$project])) {
    die('Invalid project. Use L10 or L11');
}

$config = $PROJECT_CONFIG[$project];
$table = $config['table'];
$stages = $config['stages'];

// Bay filters with date constraints
const BAY_FILTERS = [
    'BAY_11' => '2026-02-05 15:00:00',
    'BAY_12' => '2026-02-06 16:00:00',
    'BAY_13' => '2026-02-06 16:00:00'
];

// MySQL Connection
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
    die('Connection error: ' . $e->getMessage());
}

// Build dynamic query
$select_columns = ['usn', 'bay', 'ip', 'rack_pn', 'model', 'batch', 'current_stage', 'test_start_time'];
foreach ($stages as $stage) {
    $sl = strtolower($stage);
    $select_columns[] = "{$sl}_pass";
    $select_columns[] = "{$sl}_duration_hours";
}
$select_columns[] = 'ultima_actualizacion';

// Build WHERE clause with bay filters
$where_conditions = [];
foreach (BAY_FILTERS as $bay_name => $min_date) {
    $where_conditions[] = "(bay = '{$bay_name}' AND test_start_time >= '{$min_date}')";
}
$where_clause = "WHERE (" . implode(' OR ', $where_conditions) . ")";

// Add bay filter if specified
if ($bay !== 'all') {
    $where_clause .= " AND bay = :bay";
}

$sql = "SELECT " . implode(', ', $select_columns) . " FROM {$table} {$where_clause} ORDER BY bay, usn";

$stmt = $pdo->prepare($sql);
if ($bay !== 'all') {
    $stmt->bindParam(':bay', $bay, PDO::PARAM_STR);
}
$stmt->execute();
$data = $stmt->fetchAll();

if (empty($data)) {
    die('No data to export');
}

// Configure headers for Excel download
$bay_suffix = ($bay !== 'all') ? "_{$bay}" : '';
$filename = $table . $bay_suffix . '_' . date('Y-m-d_His') . '.xls';
header('Content-Type: application/vnd.ms-excel; charset=UTF-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Pragma: no-cache');
header('Expires: 0');

// UTF-8 BOM for Excel
echo "\xEF\xBB\xBF";

// Generate HTML table with styles (Excel recognizes this)
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        table {
            border-collapse: collapse;
            font-family: Arial, sans-serif;
            font-size: 11pt;
        }
        th {
            background-color: #4472C4;
            color: white;
            font-weight: bold;
            text-align: center;
            padding: 8px;
            border: 1px solid #000;
        }
        td {
            padding: 6px;
            border: 1px solid #ccc;
            text-align: left;
        }
        tr:nth-child(even) {
            background-color: #F2F2F2;
        }
        .number {
            text-align: right;
        }
        .center {
            text-align: center;
        }
    </style>
</head>
<body>
    <table>
        <thead>
            <tr>
                <th>USN</th>
                <th>Bay</th>
                <th>IP</th>
                <th>Rack PN</th>
                <th>Model</th>
                <th>Batch</th>
                <th>Current Stage</th>
                <th>Test Start</th>
                <?php foreach ($stages as $stage): ?>
                <th><?= $stage ?> Pass</th>
                <th><?= $stage ?> Hours</th>
                <?php endforeach; ?>
                <th>Last Update</th>
            </tr>
        </thead>
        <tbody>
<?php foreach ($data as $row): ?>
            <tr>
                <td><?= htmlspecialchars($row['usn'] ?? '') ?></td>
                <td class="center"><?= htmlspecialchars($row['bay'] ?? '') ?></td>
                <td class="center"><?= htmlspecialchars($row['ip'] ?? '') ?></td>
                <td><?= htmlspecialchars($row['rack_pn'] ?? '') ?></td>
                <td><?= htmlspecialchars($row['model'] ?? '') ?></td>
                <td><?= htmlspecialchars($row['batch'] ?? '') ?></td>
                <td class="center"><?= htmlspecialchars($row['current_stage'] ?? '') ?></td>
                <td class="center"><?= htmlspecialchars($row['test_start_time'] ?? '') ?></td>
                <?php foreach ($stages as $stage): 
                    $sl = strtolower($stage);
                    $pass_col = "{$sl}_pass";
                    $hours_col = "{$sl}_duration_hours";
                ?>
                <td class="center"><?= htmlspecialchars($row[$pass_col] ?? '') ?></td>
                <td class="number"><?= $row[$hours_col] !== null ? number_format($row[$hours_col], 2) : '' ?></td>
                <?php endforeach; ?>
                <td class="center"><?= htmlspecialchars($row['ultima_actualizacion'] ?? '') ?></td>
            </tr>
<?php endforeach; ?>
        </tbody>
    </table>
    
    <br>
    <p><strong>Total records:</strong> <?= count($data) ?></p>
    <p><strong>Project:</strong> <?= $project ?></p>
    <p><strong>Bay:</strong> <?= $bay === 'all' ? 'All Bays' : $bay ?></p>
    <p><strong>Generated:</strong> <?= date('Y-m-d H:i:s') ?></p>
</body>
</html>
