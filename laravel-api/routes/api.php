<?php

use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ProductController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'runtime' => 'laravel-octane-frankenphp',
        'version' => app()->version(),
        'php' => PHP_VERSION,
    ]);
});

// Categories CRUD
Route::apiResource('categories', CategoryController::class);

// Products CRUD (full CRUD with pagination only)
Route::apiResource('products', ProductController::class);
