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
// 3. PRODUCTS (FULL CRUD WITH PAGINATION ONLY)
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
