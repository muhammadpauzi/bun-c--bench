<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['message' => 'Gogolabs Laravel Octane API']);
});

Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'runtime' => 'laravel-octane-frankenphp',
        'version' => app()->version(),
        'php' => PHP_VERSION,
    ]);
});
