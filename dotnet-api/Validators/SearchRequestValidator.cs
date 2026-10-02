using DotnetApi.DTOs;
using FluentValidation;

namespace DotnetApi.Validators;

public class SearchRequestValidator : AbstractValidator<SearchRequest>
{
    private static readonly HashSet<string> AllowedFilterFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "id", "name", "price", "createdAt", "created_at", "updatedAt", "updated_at",
        "categoryId", "category_id", "category.id", "category.name", "category.slug",
        "category.createdAt", "category.created_at"
    };

    private static readonly HashSet<string> AllowedSortFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "id", "name", "price", "createdAt", "created_at", "updatedAt", "updated_at",
        "categoryId", "category_id", "category.id", "category.name", "category.slug"
    };

    public SearchRequestValidator()
    {
        When(x => x.Pagination != null, () =>
        {
            RuleFor(x => x.Pagination!.Page)
                .GreaterThan(0)
                .When(x => x.Pagination!.Page.HasValue)
                .WithMessage("Page harus lebih besar dari 0");

            RuleFor(x => x.Pagination!.Limit)
                .InclusiveBetween(1, 100)
                .When(x => x.Pagination!.Limit.HasValue)
                .WithMessage("Limit harus antara 1 dan 100");
        });

        When(x => x.Filter != null && x.Filter.Conditions != null, () =>
        {
            RuleForEach(x => x.Filter!.Conditions)
                .ChildRules(condition =>
                {
                    condition.RuleFor(c => c.Field)
                        .Must(f => string.IsNullOrEmpty(f) || AllowedFilterFields.Contains(f))
                        .WithMessage(c => $"Field '{c.Field}' tidak terdaftar atau tidak diizinkan untuk difilter.");
                });
        });

        When(x => x.Sort != null, () =>
        {
            RuleForEach(x => x.Sort)
                .ChildRules(sort =>
                {
                    sort.RuleFor(s => s.Field)
                        .NotEmpty().WithMessage("Item pengurutan (sort) harus memiliki properti 'field'.")
                        .Must(f => string.IsNullOrEmpty(f) || AllowedSortFields.Contains(f))
                        .WithMessage(s => $"Field '{s.Field}' tidak terdaftar atau tidak diizinkan untuk disortir.");

                    sort.RuleFor(s => s.Order)
                        .Must(o => string.IsNullOrEmpty(o) || o.Equals("asc", StringComparison.OrdinalIgnoreCase) || o.Equals("desc", StringComparison.OrdinalIgnoreCase))
                        .WithMessage("Order harus bernilai 'asc' atau 'desc'.");
                });
        });
    }
}
