<?php
// Comprueba que el servidor puede hablar con la base de datos de Neon.
// No muestra contraseñas. Cuando todo funcione puedes borrar este archivo.
header('Content-Type: text/html; charset=utf-8');

function linea($ok, $texto) {
    echo ($ok ? '✅ ' : '❌ ') . htmlspecialchars($texto) . '<br><br>';
}

echo '<h2>Diagnóstico</h2>';
linea(true, 'PHP funciona. Versión ' . PHP_VERSION);
linea(extension_loaded('pdo_pgsql'), extension_loaded('pdo_pgsql')
    ? 'Extensión pdo_pgsql activa'
    : 'Falta la extensión pdo_pgsql (revisa el Dockerfile)');

$url = getenv('DATABASE_URL');
linea((bool) $url, $url ? 'Variable DATABASE_URL configurada (host: ' . parse_url($url, PHP_URL_HOST) . ')'
                        : 'Falta la variable DATABASE_URL en Render (Environment)');

if ($url && extension_loaded('pdo_pgsql')) {
    try {
        require 'conexion.php';
        $pdo = conectar();
        linea(true, 'Conexión a la base de datos correcta: ' . $pdo->query('SELECT version()')->fetchColumn());
        foreach (['bienes', 'usuarios', 'resguardantes', 'fichas_creadas', 'fotos_modelo'] as $t) {
            try {
                $n = $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
                linea(true, "Tabla $t: $n registros");
            } catch (Throwable $e) {
                linea(false, "Tabla $t no existe (ejecuta los scripts de inventario_neon en Neon)");
            }
        }
    } catch (Throwable $e) {
        linea(false, 'No se pudo conectar: ' . $e->getMessage());
    }
}

session_start();
linea(true, 'Las sesiones funcionan');
