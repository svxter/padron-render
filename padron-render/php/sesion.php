<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

// Cambia 'usuario' por la variable de sesión que use tu login.
if (empty($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['ok' => false]);
    exit;
}
echo json_encode(['ok' => true]);
