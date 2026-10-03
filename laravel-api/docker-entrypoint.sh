#!/usr/bin/env bash
set -e

# Cache configuration, routes, events, and views using runtime environment variables
php artisan config:cache
php artisan route:cache
php artisan event:cache
php artisan view:cache

# Start Laravel Octane FrankenPHP
exec php artisan octane:frankenphp --host=0.0.0.0 --port=3000 --workers=6
