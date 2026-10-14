<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

// Cambia 'usuario' por la variable de sesión que use tu login.
if (empty($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Sesión no válida']);
    exit;
}

require 'conexion.php';

// Recibe varios candidatos separados por coma: ?inv=3033,C05102,8801
$lista = array_values(array_unique(array_filter(array_map('trim', explode(',', $_GET['inv'] ?? '')))));
$lista = array_slice($lista, 0, 20);
if (!$lista) { echo json_encode([]); exit; }

$marcas = implode(',', array_fill(0, count($lista), '?'));
$pdo = conectar();
asegurarEstado($pdo);
$st = $pdo->prepare("SELECT * FROM bienes WHERE inventario IN ($marcas)");
$st->execute($lista);
echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
