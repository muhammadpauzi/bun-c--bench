<?php

namespace Tests\Feature;

use Tests\TestCase;

class CrudTest extends TestCase
{
    public function test_health_check_returns_ok(): void
    {
        $response = $this->getJson('/health');
        $response->assertStatus(200)
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('runtime', 'laravel-octane-frankenphp');
    }

    public function test_categories_crud_lifecycle(): void
    {
        // 1. Read List
        $response = $this->getJson('/api/categories');
        $response->assertStatus(200)->assertJsonPath('success', true);

        // 2. INSERT (Create)
        $uniqueSlug = 'test-cat-' . uniqid();
        $createRes = $this->postJson('/api/categories', [
            'name' => 'Test Kategori',
            'slug' => $uniqueSlug,
        ]);
        $createRes->assertStatus(201)->assertJsonPath('success', true);
        $catId = $createRes->json('data.id');
        $this->assertNotEmpty($catId);

        // 3. READ by ID
        $getRes = $this->getJson("/api/categories/{$catId}");
        $getRes->assertStatus(200)->assertJsonPath('data.id', $catId);

        // 4. UPDATE
        $updateRes = $this->putJson("/api/categories/{$catId}", [
            'name' => 'Test Kategori Updated',
        ]);
        $updateRes->assertStatus(200)->assertJsonPath('data.name', 'Test Kategori Updated');

        // 5. DELETE
        $deleteRes = $this->deleteJson("/api/categories/{$catId}");
        $deleteRes->assertStatus(200)->assertJsonPath('success', true);

        // 6. Verify 404
        $this->getJson("/api/categories/{$catId}")->assertStatus(404);
    }

    public function test_products_crud_lifecycle(): void
    {
        // 1. Read List (Paginated)
        $response = $this->getJson('/api/products?page=1&limit=5');
        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data',
                'meta' => ['page', 'limit', 'totalCount', 'totalPages', 'hasNextPage', 'hasPrevPage']
            ]);

        // 2. INSERT (Create)
        $createRes = $this->postJson('/api/products', [
            'name' => 'Laravel Test Product',
            'price' => 750000.00,
        ]);
        $createRes->assertStatus(201)->assertJsonPath('success', true);
        $prodId = $createRes->json('data.id');
        $this->assertNotEmpty($prodId);

        // 3. READ by ID
        $getRes = $this->getJson("/api/products/{$prodId}");
        $getRes->assertStatus(200)->assertJsonPath('data.id', $prodId);

        // 4. UPDATE
        $updateRes = $this->putJson("/api/products/{$prodId}", [
            'name' => 'Laravel Test Product Updated',
            'price' => 720000.00,
        ]);
        $updateRes->assertStatus(200)->assertJsonPath('data.name', 'Laravel Test Product Updated');

        // 5. DELETE
        $deleteRes = $this->deleteJson("/api/products/{$prodId}");
        $deleteRes->assertStatus(200)->assertJsonPath('success', true);

        // 6. Verify 404
        $this->getJson("/api/products/{$prodId}")->assertStatus(404);
    }
}
