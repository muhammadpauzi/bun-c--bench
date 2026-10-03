using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using DotnetApi.Data;
using DotnetApi.DTOs;
using DotnetApi.Models;
using DotnetApi.Validators;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// Configure Logging for maximum performance during benchmarks
builder.Logging.ClearProviders();
if (builder.Environment.IsDevelopment())
{
    builder.Logging.AddConsole();
}

// Database Connection String resolution
var dbUrl = Environment.GetEnvironmentVariable("DATABASE_URL") 
    ?? "postgres://postgres:postgres@localhost:5432/gogoskola_db";

string connectionString;
if (dbUrl.StartsWith("postgres://") || dbUrl.StartsWith("postgresql://"))
{
    var uri = new Uri(dbUrl);
    var userInfo = uri.UserInfo.Split(':');
    var npgsqlBuilder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Database = uri.AbsolutePath.TrimStart('/'),
        Username = userInfo.Length > 0 ? userInfo[0] : "postgres",
        Password = userInfo.Length > 1 ? userInfo[1] : "postgres",
        Pooling = true,
        MaxPoolSize = 100,
        MinPoolSize = 5
    };
    connectionString = npgsqlBuilder.ConnectionString;
}
else
{
    connectionString = dbUrl;
}

// Register DbContext with connection pooling for maximum throughput
builder.Services.AddDbContextPool<AppDbContext>(options =>
{
    options.UseNpgsql(connectionString, npgsqlOptions =>
    {
        npgsqlOptions.EnableRetryOnFailure(3);
    });
});

// Register FluentValidation
builder.Services.AddValidatorsFromAssemblyContaining<SearchRequestValidator>();

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseCors();

var processStartTime = DateTime.UtcNow;

// ==========================================
// 1. HEALTHCHECK & RESOURCE PROFILE
// ==========================================
app.MapGet("/health", () =>
{
    var process = Process.GetCurrentProcess();
    return Results.Ok(new
    {
        status = "ok",
        runtime = "dotnet-10",
        version = Environment.Version.ToString(),
        memory = new
        {
            workingSetBytes = process.WorkingSet64,
            privateMemoryBytes = process.PrivateMemorySize64,
            gcTotalMemoryBytes = GC.GetTotalMemory(false)
        },
        uptimeSeconds = (DateTime.UtcNow - processStartTime).TotalSeconds
    });
});

// ==========================================
// 2. CATEGORIES (FULL CRUD)
// ==========================================
app.MapGet("/api/categories", async (AppDbContext db) =>
{
    var list = await db.Categories
        .AsNoTracking()
        .OrderBy(c => c.Name)
        .Select(c => new
        {
            id = c.Id,
            name = c.Name,
            slug = c.Slug,
            createdAt = c.CreatedAt
        })
        .ToListAsync();

    return Results.Ok(new { success = true, data = list });
});

app.MapGet("/api/categories/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var category = await db.Categories
        .AsNoTracking()
        .Where(c => c.Id == id)
        .Select(c => new
        {
            id = c.Id,
            name = c.Name,
            slug = c.Slug,
            createdAt = c.CreatedAt
        })
        .FirstOrDefaultAsync();

    if (category == null)
    {
        return Results.NotFound(new { success = false, message = "Category not found" });
    }

    return Results.Ok(new { success = true, data = category });
});

app.MapPost("/api/categories", async ([FromBody] CreateCategoryRequest req, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Slug))
    {
        return Results.BadRequest(new { success = false, message = "Name and slug are required" });
    }

    var category = new Category
    {
        Id = Guid.NewGuid(),
        Name = req.Name,
        Slug = req.Slug,
        CreatedAt = DateTime.UtcNow
    };

    db.Categories.Add(category);
    await db.SaveChangesAsync();

    return Results.Created($"/api/categories/{category.Id}", new
    {
        success = true,
        message = "Category created successfully",
        data = new
        {
            id = category.Id,
            name = category.Name,
            slug = category.Slug,
            createdAt = category.CreatedAt
        }
    });
});

app.MapPut("/api/categories/{id:guid}", async (Guid id, [FromBody] UpdateCategoryRequest req, AppDbContext db) =>
{
    var category = await db.Categories.FindAsync(id);
    if (category == null)
    {
        return Results.NotFound(new { success = false, message = "Category not found" });
    }

    if (!string.IsNullOrWhiteSpace(req.Name)) category.Name = req.Name;
    if (!string.IsNullOrWhiteSpace(req.Slug)) category.Slug = req.Slug;

    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        success = true,
        message = "Category updated successfully",
        data = new
        {
            id = category.Id,
            name = category.Name,
            slug = category.Slug,
            createdAt = category.CreatedAt
        }
    });
});

app.MapDelete("/api/categories/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var category = await db.Categories.FindAsync(id);
    if (category == null)
    {
        return Results.NotFound(new { success = false, message = "Category not found" });
    }

    db.Categories.Remove(category);
    await db.SaveChangesAsync();

    return Results.Ok(new { success = true, message = "Category deleted successfully" });
});

// ==========================================
// 3. FIXED BENCHMARK ENDPOINTS (PARITY WITH BUN)
// ==========================================

// Case 1: Filtering & Sorting (Price Range + Order by price desc)
app.MapGet("/api/benchmark/filter-sort", async (
    [FromQuery] decimal? minPrice, 
    [FromQuery] decimal? maxPrice, 
    [FromQuery] int? limit, 
    AppDbContext db) =>
{
    var effectiveMin = minPrice ?? 50000m;
    var effectiveMax = maxPrice ?? 500000m;
    var effectiveLimit = Math.Min(limit ?? 20, 100);

    var data = await db.Products
        .AsNoTracking()
        .Include(p => p.Category)
        .Where(p => p.Price >= effectiveMin && p.Price <= effectiveMax)
        .OrderByDescending(p => p.Price)
        .Take(effectiveLimit)
        .Select(p => new
        {
            id = p.Id,
            name = p.Name,
            price = p.Price.ToString("F2"),
            createdAt = p.CreatedAt,
            category = p.Category != null ? new
            {
                id = p.Category.Id,
                name = p.Category.Name,
                slug = p.Category.Slug
            } : null
        })
        .ToListAsync();

    return Results.Ok(new { success = true, count = data.Count, data });
});

// Case 2: Deep Pagination (Offset stress)
app.MapGet("/api/benchmark/pagination-deep", async (
    [FromQuery] int? page, 
    [FromQuery] int? limit, 
    AppDbContext db) =>
{
    var effectivePage = Math.Max(page ?? 500, 1);
    var effectiveLimit = Math.Min(limit ?? 20, 100);
    var offset = (effectivePage - 1) * effectiveLimit;

    var data = await db.Products
        .AsNoTracking()
        .OrderByDescending(p => p.CreatedAt)
        .Skip(offset)
        .Take(effectiveLimit)
        .Select(p => new
        {
            id = p.Id,
            name = p.Name,
            price = p.Price.ToString("F2"),
            createdAt = p.CreatedAt
        })
        .ToListAsync();

    return Results.Ok(new { success = true, page = effectivePage, limit = effectiveLimit, offset, count = data.Count, data });
});

// Case 3: Searching (ILIKE Pattern Match on 500k rows)
app.MapGet("/api/benchmark/search-text", async (
    [FromQuery] string? q, 
    [FromQuery] int? limit, 
    AppDbContext db) =>
{
    var searchTerm = q ?? "Galaxy";
    var effectiveLimit = Math.Min(limit ?? 20, 100);

    var data = await db.Products
        .AsNoTracking()
        .Where(p => EF.Functions.ILike(p.Name, $"%{searchTerm}%"))
        .Take(effectiveLimit)
        .Select(p => new
        {
            id = p.Id,
            name = p.Name,
            price = p.Price.ToString("F2"),
            createdAt = p.CreatedAt
        })
        .ToListAsync();

    return Results.Ok(new { success = true, query = searchTerm, count = data.Count, data });
});

// Case 4: Grouping & Aggregation (Category stats)
app.MapGet("/api/benchmark/group-aggregate", async (AppDbContext db) =>
{
    var stats = await db.Categories
        .AsNoTracking()
        .Select(c => new
        {
            categoryId = c.Id,
            categoryName = c.Name,
            categorySlug = c.Slug,
            totalProducts = c.Products.Count(),
            avgPrice = c.Products.Average(p => (double?)p.Price) ?? 0,
            minPrice = c.Products.Min(p => (decimal?)p.Price) ?? 0,
            maxPrice = c.Products.Max(p => (decimal?)p.Price) ?? 0
        })
        .OrderByDescending(s => s.totalProducts)
        .ToListAsync();

    return Results.Ok(new { success = true, totalGroups = stats.Count, data = stats });
});

// Case 5: CPU Compute & Heavy JSON Serialization
app.MapGet("/api/benchmark/cpu-json", async ([FromQuery] int? limit, AppDbContext db) =>
{
    var effectiveLimit = Math.Min(limit ?? 200, 500);

    var items = await db.Products
        .AsNoTracking()
        .Take(effectiveLimit)
        .Select(p => new
        {
            id = p.Id,
            name = p.Name,
            price = p.Price,
            createdAt = p.CreatedAt
        })
        .ToListAsync();

    var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    var transformed = items.Select((p, idx) =>
    {
        int hash = 0;
        foreach (char c in p.name)
        {
            hash = (hash << 5) - hash + c;
        }

        var numPrice = p.price;
        return new
        {
            id = p.id,
            name = p.name,
            price = numPrice.ToString("F2"),
            createdAt = p.createdAt,
            tax = Math.Round(numPrice * 0.11m, 2),
            discount = Math.Round(numPrice * 0.05m, 2),
            finalPrice = Math.Round(numPrice * 1.06m, 2),
            hashToken = Math.Abs(hash).ToString("x"),
            indexKey = idx,
            timestamp = now
        };
    }).ToList();

    return Results.Ok(new { success = true, count = transformed.Count, data = transformed });
});

// ==========================================
// 4. DYNAMIC PRODUCTS SEARCH (PRIMARY POST /api/products/search WITH FLUENTVALIDATION)
// ==========================================
app.MapPost("/api/products/search", async (
    [FromBody] SearchRequest request, 
    IValidator<SearchRequest> validator, 
    AppDbContext db) =>
{
    var sw = Stopwatch.StartNew();

    // 1. FluentValidation Execution
    var validationResult = await validator.ValidateAsync(request);
    if (!validationResult.IsValid)
    {
        var firstErr = validationResult.Errors.First();
        return Results.BadRequest(new
        {
            success = false,
            error = firstErr.ErrorMessage,
            details = validationResult.ToDictionary()
        });
    }

    var page = request.Pagination?.Page ?? 1;
    var limit = request.Pagination?.Limit ?? 10;
    page = Math.Max(page, 1);
    limit = Math.Clamp(limit, 1, 100);
    var offset = (page - 1) * limit;

    var query = db.Products.AsNoTracking().Include(p => p.Category).AsQueryable();

    // 2. Parse Filters
    if (request.Filter?.Conditions != null)
    {
        foreach (var cond in request.Filter.Conditions)
        {
            if (string.IsNullOrEmpty(cond.Field)) continue;
            var valStr = cond.Value?.ToString();

            if (cond.Field.Equals("name", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(valStr))
            {
                query = query.Where(p => EF.Functions.ILike(p.Name, $"%{valStr}%"));
            }
            else if ((cond.Field.Equals("categoryId", StringComparison.OrdinalIgnoreCase) || 
                      cond.Field.Equals("category_id", StringComparison.OrdinalIgnoreCase)) && 
                     Guid.TryParse(valStr, out var catGuid))
            {
                query = query.Where(p => p.CategoryId == catGuid);
            }
            else if (cond.Field.Equals("price", StringComparison.OrdinalIgnoreCase) && 
                     decimal.TryParse(valStr, out var numPrice))
            {
                var op = cond.Operator?.ToLowerInvariant() ?? "eq";
                query = op switch
                {
                    "gte" => query.Where(p => p.Price >= numPrice),
                    "gt" => query.Where(p => p.Price > numPrice),
                    "lte" => query.Where(p => p.Price <= numPrice),
                    "lt" => query.Where(p => p.Price < numPrice),
                    _ => query.Where(p => p.Price == numPrice)
                };
            }
        }
    }

    var totalCount = await query.CountAsync();

    // 3. Sorting
    var sortItem = request.Sort?.FirstOrDefault();
    var sortBy = sortItem?.Field?.ToLowerInvariant() ?? "created_at";
    var sortOrder = sortItem?.Order?.ToLowerInvariant() ?? "desc";

    query = (sortBy, sortOrder) switch
    {
        ("name", "asc") => query.OrderBy(p => p.Name),
        ("name", "desc") => query.OrderByDescending(p => p.Name),
        ("price", "asc") => query.OrderBy(p => p.Price),
        ("price", "desc") => query.OrderByDescending(p => p.Price),
        ("createdat" or "created_at", "asc") => query.OrderBy(p => p.CreatedAt),
        _ => query.OrderByDescending(p => p.CreatedAt)
    };

    var items = await query.Skip(offset).Take(limit).Select(p => new
    {
        id = p.Id,
        name = p.Name,
        price = p.Price.ToString("F2"),
        createdAt = p.CreatedAt,
        category = p.Category != null ? new
        {
            id = p.Category.Id,
            name = p.Category.Name,
            slug = p.Category.Slug
        } : null
    }).ToListAsync();

    sw.Stop();

    var totalPages = (int)Math.Ceiling(totalCount / (double)limit);

    return Results.Ok(new
    {
        success = true,
        data = items,
        meta = new
        {
            page,
            limit,
            totalCount,
            totalPages,
            hasNextPage = page < totalPages,
            hasPrevPage = page > 1,
            executionTimeMs = Math.Round(sw.Elapsed.TotalMilliseconds, 2)
        }
    });
});

// ==========================================
// 5. PRODUCTS (FULL CRUD WITH PAGINATION ONLY)
// ==========================================

// GET /api/products - Paginated list (no filter, search, or sorting)
app.MapGet("/api/products", async ([FromQuery] int? page, [FromQuery] int? limit, AppDbContext db) =>
{
    var effectivePage = Math.Max(page ?? 1, 1);
    var effectiveLimit = Math.Clamp(limit ?? 10, 1, 100);
    var offset = (effectivePage - 1) * effectiveLimit;

    var totalCount = await db.Products.CountAsync();
    var totalPages = (int)Math.Ceiling(totalCount / (double)effectiveLimit);

    var items = await db.Products
        .AsNoTracking()
        .OrderByDescending(p => p.CreatedAt)
        .Skip(offset)
        .Take(effectiveLimit)
        .Select(p => new
        {
            id = p.Id,
            name = p.Name,
            price = p.Price.ToString("F2"),
            createdAt = p.CreatedAt,
            updatedAt = p.UpdatedAt,
            category = p.Category != null ? new
            {
                id = p.Category.Id,
                name = p.Category.Name,
                slug = p.Category.Slug
            } : null
        })
        .ToListAsync();

    return Results.Ok(new
    {
        success = true,
        data = items,
        meta = new
        {
            page = effectivePage,
            limit = effectiveLimit,
            totalCount,
            totalPages,
            hasNextPage = effectivePage < totalPages,
            hasPrevPage = effectivePage > 1
        }
    });
});

// GET /api/products/{id:guid} - Single product by ID
app.MapGet("/api/products/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var item = await db.Products
        .AsNoTracking()
        .Where(p => p.Id == id)
        .Select(p => new
        {
            id = p.Id,
            name = p.Name,
            price = p.Price.ToString("F2"),
            createdAt = p.CreatedAt,
            updatedAt = p.UpdatedAt,
            category = p.Category != null ? new
            {
                id = p.Category.Id,
                name = p.Category.Name,
                slug = p.Category.Slug
            } : null
        })
        .FirstOrDefaultAsync();

    if (item == null)
    {
        return Results.NotFound(new { success = false, message = "Product not found" });
    }

    return Results.Ok(new { success = true, data = item });
});

// POST /api/products - Create product
app.MapPost("/api/products", async ([FromBody] CreateProductRequest req, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(req.Name))
    {
        return Results.BadRequest(new { success = false, message = "Name is required" });
    }

    var product = new Product
    {
        Id = Guid.NewGuid(),
        Name = req.Name,
        Price = req.Price,
        CategoryId = req.CategoryId,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    db.Products.Add(product);
    await db.SaveChangesAsync();

    return Results.Created($"/api/products/{product.Id}", new
    {
        success = true,
        message = "Product created successfully",
        data = new
        {
            id = product.Id,
            name = product.Name,
            price = product.Price.ToString("F2"),
            categoryId = product.CategoryId,
            createdAt = product.CreatedAt,
            updatedAt = product.UpdatedAt
        }
    });
});

// PUT /api/products/{id:guid} - Update product
app.MapPut("/api/products/{id:guid}", async (Guid id, [FromBody] UpdateProductRequest req, AppDbContext db) =>
{
    var product = await db.Products.FindAsync(id);
    if (product == null)
    {
        return Results.NotFound(new { success = false, message = "Product not found" });
    }

    if (!string.IsNullOrWhiteSpace(req.Name)) product.Name = req.Name;
    if (req.Price.HasValue) product.Price = req.Price.Value;
    if (req.CategoryId.HasValue) product.CategoryId = req.CategoryId.Value;
    product.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        success = true,
        message = "Product updated successfully",
        data = new
        {
            id = product.Id,
            name = product.Name,
            price = product.Price.ToString("F2"),
            categoryId = product.CategoryId,
            createdAt = product.CreatedAt,
            updatedAt = product.UpdatedAt
        }
    });
});

// DELETE /api/products/{id:guid} - Delete product
app.MapDelete("/api/products/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var product = await db.Products.FindAsync(id);
    if (product == null)
    {
        return Results.NotFound(new { success = false, message = "Product not found" });
    }

    db.Products.Remove(product);
    await db.SaveChangesAsync();

    return Results.Ok(new { success = true, message = "Product deleted successfully" });
});

app.Run();
