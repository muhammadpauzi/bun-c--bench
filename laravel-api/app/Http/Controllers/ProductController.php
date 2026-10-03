<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $page = max((int) $request->query('page', 1), 1);
        $limit = min(max((int) $request->query('limit', 10), 1), 100);
        $offset = ($page - 1) * $limit;

        $totalCount = Product::query()->count();
        $totalPages = (int) ceil($totalCount / $limit);

        $products = Product::query()
            ->with(['category:id,name,slug'])
            ->orderByDesc('created_at')
            ->offset($offset)
            ->limit($limit)
            ->get();

        $items = $products->map(function ($p) {
            return [
                'id' => $p->id,
                'name' => $p->name,
                'price' => (string) $p->price,
                'createdAt' => $p->created_at?->toISOString(),
                'updatedAt' => $p->updated_at?->toISOString(),
                'category' => $p->category ? [
                    'id' => $p->category->id,
                    'name' => $p->category->name,
                    'slug' => $p->category->slug,
                ] : null,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $items,
            'meta' => [
                'page' => $page,
                'limit' => $limit,
                'totalCount' => $totalCount,
                'totalPages' => $totalPages,
                'hasNextPage' => $page < $totalPages,
                'hasPrevPage' => $page > 1,
            ],
        ]);
    }

    public function show(string $id): JsonResponse
    {
        $product = Product::query()->with(['category:id,name,slug'])->find($id);

        if (!$product) {
            return response()->json([
                'success' => false,
                'message' => 'Product not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $product->id,
                'name' => $product->name,
                'price' => (string) $product->price,
                'createdAt' => $product->created_at?->toISOString(),
                'updatedAt' => $product->updated_at?->toISOString(),
                'category' => $product->category ? [
                    'id' => $product->category->id,
                    'name' => $product->category->name,
                    'slug' => $product->category->slug,
                ] : null,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'price' => 'required|numeric',
            'category_id' => 'nullable|uuid|exists:categories,id',
            'categoryId' => 'nullable|uuid|exists:categories,id',
        ]);

        $categoryId = $validated['categoryId'] ?? $validated['category_id'] ?? null;

        $product = Product::create([
            'name' => $validated['name'],
            'price' => $validated['price'],
            'category_id' => $categoryId,
        ]);

        $product->load(['category:id,name,slug']);

        return response()->json([
            'success' => true,
            'message' => 'Product created successfully',
            'data' => [
                'id' => $product->id,
                'name' => $product->name,
                'price' => (string) $product->price,
                'createdAt' => $product->created_at?->toISOString(),
                'updatedAt' => $product->updated_at?->toISOString(),
                'category' => $product->category ? [
                    'id' => $product->category->id,
                    'name' => $product->category->name,
                    'slug' => $product->category->slug,
                ] : null,
            ],
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $product = Product::query()->find($id);

        if (!$product) {
            return response()->json([
                'success' => false,
                'message' => 'Product not found',
            ], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'price' => 'sometimes|numeric',
            'category_id' => 'nullable|uuid|exists:categories,id',
            'categoryId' => 'nullable|uuid|exists:categories,id',
        ]);

        if ($request->has('categoryId')) {
            $validated['category_id'] = $request->input('categoryId');
        }

        $product->update($validated);
        $product->load(['category:id,name,slug']);

        return response()->json([
            'success' => true,
            'message' => 'Product updated successfully',
            'data' => [
                'id' => $product->id,
                'name' => $product->name,
                'price' => (string) $product->price,
                'createdAt' => $product->created_at?->toISOString(),
                'updatedAt' => $product->updated_at?->toISOString(),
                'category' => $product->category ? [
                    'id' => $product->category->id,
                    'name' => $product->category->name,
                    'slug' => $product->category->slug,
                ] : null,
            ],
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $product = Product::query()->find($id);

        if (!$product) {
            return response()->json([
                'success' => false,
                'message' => 'Product not found',
            ], 404);
        }

        $product->delete();

        return response()->json([
            'success' => true,
            'message' => 'Product deleted successfully',
        ]);
    }
}
