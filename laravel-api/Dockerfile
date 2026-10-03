FROM dunglas/frankenphp:latest

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

RUN install-php-extensions \
    pcntl \
    pdo_pgsql \
    pgsql \
    bcmath \
    intl \
    zip \
    opcache

WORKDIR /app

COPY . /app

RUN composer install --no-dev --optimize-autoloader --no-interaction

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["php", "artisan", "octane:frankenphp", "--host=0.0.0.0", "--port=3000"]
