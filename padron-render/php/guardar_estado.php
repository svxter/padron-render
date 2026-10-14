<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

if (empty($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Sesión no válida']);
    exit;
}

require 'conexion.php';

function fallo($codigo, $texto) {
    http_response_code($codigo);
    echo json_encode(['error' => $texto]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fallo(405, 'Solicitud no válida.');

$inv    = trim($_POST['inv'] ?? '');
$estado = strtoupper(trim($_POST['estado'] ?? ''));
$validos = ['BUENO', 'REGULAR', 'MALO', 'INSERVIBLE'];

if ($inv === '') fallo(400, 'Falta el número de inventario.');
if ($estado !== '' && !in_array($estado, $validos, true)) fallo(400, 'Estado no válido.');

$pdo = conectar();
asegurarEstado($pdo);

$ck = $pdo->prepare('SELECT 1 FROM bienes WHERE inventario = ?');
$ck->execute([$inv]);
if (!$ck->fetch()) fallo(404, 'No existe ese número de inventario.');

$st = $pdo->prepare('UPDATE bienes SET estado_bien = ? WHERE inventario = ?');
$st->execute([$estado === '' ? null : $estado, $inv]);
echo json_encode(['ok' => true]);