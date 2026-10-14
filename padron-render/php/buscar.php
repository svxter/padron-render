<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

if (empty($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Sesión no válida']);
    exit;
}

require 'conexion.php';
$inv = trim($_GET['inv'] ?? '');
if ($inv === '') {
    echo json_encode(['error' => 'Escribe un número de inventario']);
    exit;
}

$pdo = conectar();
asegurarEstado($pdo);
$st = $pdo->prepare('SELECT * FROM bienes WHERE inventario = ? LIMIT 1');
$st->execute([$inv]);
$bien = $st->fetch(PDO::FETCH_ASSOC);

if (!$bien) {
    echo json_encode(['error' => 'No se encontró el número de inventario ' . $inv]);
    exit;
}

// --- VERIFICACIÓN REAL ---
// Esto será true SOLAMENTE si el bien ya tiene un estatus contable registrado previamente.
// Si está vacío, significa que es un inventario nuevo sin ficha generada.
$bien['ficha_existente'] = !empty($bien['estatus_contable']);

echo json_encode($bien, JSON_UNESCAPED_UNICODE);