<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

if (empty($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Sesión no válida']);
    exit;
}

require 'conexion.php';
$pdo = conectar();
asegurarEstado($pdo);


$conteos = ['BUENO' => 0, 'REGULAR' => 0, 'MALO' => 0, 'INSERVIBLE' => 0, 'SIN' => 0];
foreach ($pdo->query("SELECT COALESCE(estado_bien, 'SIN') AS e, COUNT(*) AS n FROM bienes GROUP BY e") as $f) {
    if (isset($conteos[$f['e']])) $conteos[$f['e']] = (int) $f['n'];
}

$estado = strtoupper($_GET['estatus'] ?? 'BUENO');
if (!isset($conteos[$estado])) $estado = 'BUENO';
$q      = trim($_GET['q'] ?? '');
$pagina = max(1, (int) ($_GET['pagina'] ?? 1));
$por    = 50;
$desde  = ($pagina - 1) * $por;

$donde = []; $params = [];
if ($estado === 'SIN') { $donde[] = 'estado_bien IS NULL'; }
else { $donde[] = 'estado_bien = ?'; $params[] = $estado; }
if ($q !== '') { $donde[] = 'inventario LIKE ?'; $params[] = '%' . $q . '%'; }


$where = implode(' AND ', $donde);


if (isset($_GET['todos'])) {
    $st = $pdo->prepare("SELECT inventario FROM bienes WHERE $where ORDER BY LENGTH(inventario), inventario");
    $st->execute($params);
    echo json_encode(['inventarios' => $st->fetchAll(PDO::FETCH_COLUMN)], JSON_UNESCAPED_UNICODE);
    exit;
}

$st = $pdo->prepare("SELECT COUNT(*) FROM bienes WHERE $where");

$st = $pdo->prepare("SELECT COUNT(*) FROM bienes WHERE $where");
$st->execute($params);
$total = (int) $st->fetchColumn();

$st = $pdo->prepare("SELECT inventario, estado_bien FROM bienes WHERE $where ORDER BY LENGTH(inventario), inventario LIMIT $por OFFSET $desde");
$st->execute($params);
$filas = array_map(fn($f) => ['inventario' => $f['inventario'], 'estado' => $f['estado_bien']], $st->fetchAll());

echo json_encode([
    'conteos' => $conteos, 'total' => $total, 'pagina' => $pagina, 'por' => $por, 'filas' => $filas,
], JSON_UNESCAPED_UNICODE);