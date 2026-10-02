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
// 2. CATEGORIES
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
            slug = c.Slug
        })
        .ToListAsync();

    return Results.Ok(new { success = true, data = list });
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

app.Run();
