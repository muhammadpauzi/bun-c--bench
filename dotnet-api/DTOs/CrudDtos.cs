namespace DotnetApi.DTOs;

public record CreateCategoryRequest(string Name, string Slug);
public record UpdateCategoryRequest(string? Name, string? Slug);

public record CreateProductRequest(string Name, decimal Price, Guid? CategoryId);
public record UpdateProductRequest(string? Name, decimal? Price, Guid? CategoryId);
