import React, { useState, useEffect, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  RefreshCw,
  Folder,
  Tag,
  Calendar,
  DollarSign,
  ChevronDown,
  Plus,
  Trash2,
  SlidersHorizontal,
  AlertTriangle,
  X,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  name: string;
  price: string;
  createdAt: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

interface GroupedData {
  groupKey: string;
  groupLabel: string;
  groupMeta?: Record<string, any>;
  totalItems: number;
  items: Product[];
}

interface Meta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  totalGroups?: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  executionTimeMs: number;
}

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null';

export interface DynamicFilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

const FILTER_FIELDS = [
  { value: 'name', label: 'Nama Produk' },
  { value: 'categoryId', label: 'Kategori (ID)' },
  { value: 'category.slug', label: 'Slug Kategori' },
  { value: 'price', label: 'Harga (Rp)' },
  { value: 'createdAt', label: 'Tanggal Dibuat' },
];

function getOperatorsForField(field: string): { value: FilterOperator; label: string }[] {
  if (field === 'price') {
    return [
      { value: 'gte', label: '>= (Minimal)' },
      { value: 'lte', label: '<= (Maksimal)' },
      { value: 'gt', label: '> (Lebih Dari)' },
      { value: 'lt', label: '< (Kurang Dari)' },
      { value: 'eq', label: '= (Sama Dengan)' },
      { value: 'ne', label: '!= (Tidak Sama)' },
      { value: 'in', label: 'Termasuk (koma)' },
    ];
  }
  if (field === 'createdAt') {
    return [
      { value: 'gte', label: '>= Mulai Tanggal' },
      { value: 'lte', label: '<= Sampai Tanggal' },
      { value: 'is_not_null', label: 'Ada Tanggal (Not Null)' },
    ];
  }
  if (field === 'categoryId') {
    return [
      { value: 'eq', label: '= (Kategori ini)' },
      { value: 'ne', label: '!= (Bukan Kategori ini)' },
      { value: 'is_null', label: 'Tanpa Kategori (Null)' },
      { value: 'is_not_null', label: 'Ada Kategori (Not Null)' },
    ];
  }
  return [
    { value: 'ilike', label: 'Mengandung (ilike)' },
    { value: 'eq', label: '= (Sama Persis)' },
    { value: 'ne', label: '!= (Tidak Sama)' },
    { value: 'like', label: 'Sesuai Pola (like)' },
    { value: 'in', label: 'Termasuk (koma)' },
    { value: 'not_in', label: 'Tidak Termasuk (koma)' },
  ];
}

interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Frontend ErrorBoundary caught an error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full border border-rose-200 shadow-lg text-center">
            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1">Terjadi Kesalahan UI</h2>
            <p className="text-xs text-slate-600 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-left overflow-x-auto">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AdminDashboard />
    </ErrorBoundary>
  );
}

function AdminDashboard() {
  // Categories State
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Quick Filter State
  const [searchName, setSearchName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');

  // Dynamic Multi-Filter Builder State
  const [dynamicFilters, setDynamicFilters] = useState<DynamicFilterRule[]>([]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting & Pagination State
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);

  // Grouping State
  const [groupByMode, setGroupByMode] = useState<
    'none' | 'category' | 'date_month' | 'date_day' | 'price_bucket'
  >('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Query Results State
  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch categories for dropdown
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setCategories(json.data);
        }
      })
      .catch((err) => console.error('Error fetching categories:', err))
      .finally(() => setLoadingCategories(false));
  }, []);

  const addDynamicFilter = () => {
    const newRule: DynamicFilterRule = {
      id: Math.random().toString(36).substring(2, 9),
      field: 'name',
      operator: 'ilike',
      value: '',
    };
    setDynamicFilters((prev) => [...prev, newRule]);
    setShowAdvancedFilters(true);
  };

  const removeDynamicFilter = (id: string) => {
    setDynamicFilters((prev) => prev.filter((r) => r.id !== id));
  };

  const updateDynamicFilter = (id: string, updates: Partial<DynamicFilterRule>) => {
    setDynamicFilters((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...updates };
        if (updates.field && updates.field !== r.field) {
          const availableOps = getOperatorsForField(updates.field);
          if (!availableOps.some((op) => op.value === updated.operator)) {
            updated.operator = availableOps[0]!.value;
          }
          updated.value = '';
        }
        return updated;
      })
    );
  };

  const clearAllFilters = () => {
    setSearchName('');
    setSelectedCategoryId('all');
    setDynamicFilters([]);
    setPage(1);
  };

  const handleGroupByChange = (newMode: string) => {
    setLoading(true);
    setData([]);
    setGroupByMode(newMode as any);
    setPage(1);
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const conditions: any[] = [];

    if (searchName.trim()) {
      conditions.push({ field: 'name', operator: 'ilike', value: searchName.trim() });
    }

    if (selectedCategoryId !== 'all') {
      conditions.push({ field: 'categoryId', operator: 'eq', value: selectedCategoryId });
    }

    for (const rule of dynamicFilters) {
      if (rule.operator === 'is_null' || rule.operator === 'is_not_null') {
        conditions.push({ field: rule.field, operator: rule.operator });
        continue;
      }

      if (!rule.value || !rule.value.trim()) continue;

      let parsedVal: any = rule.value.trim();

      if (rule.field === 'price') {
        if (rule.operator === 'in' || rule.operator === 'not_in') {
          parsedVal = rule.value
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => !isNaN(n));
        } else {
          parsedVal = Number(rule.value);
        }
      } else if (rule.operator === 'in' || rule.operator === 'not_in') {
        parsedVal = rule.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      conditions.push({
        field: rule.field,
        operator: rule.operator,
        value: parsedVal,
      });
    }

    let groupByOption: any = undefined;
    if (groupByMode === 'category') {
      groupByOption = {
        field: 'category.id',
        labelField: 'category.name',
        metaFields: ['category.slug'],
      };
    } else if (groupByMode === 'date_month') {
      groupByOption = { field: 'createdAt', dateTrunc: 'month' };
    } else if (groupByMode === 'date_day') {
      groupByOption = { field: 'createdAt', dateTrunc: 'day' };
    } else if (groupByMode === 'price_bucket') {
      groupByOption = { field: 'price', numberBucket: 5000000 };
    }

    const payload = {
      filter: conditions.length > 0 ? { logic: filterLogic, conditions } : undefined,
      sort: [{ field: sortBy, order: sortOrder }],
      pagination: { page, limit },
      groupBy: groupByOption,
    };

    try {
      const res = await fetch('/api/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memuat data dari server');
      }

      setData(Array.isArray(json.data) ? json.data : []);
      setMeta(json.meta || null);
    } catch (err: any) {
      setError(err.message || 'Network error');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [
    searchName,
    selectedCategoryId,
    dynamicFilters,
    filterLogic,
    sortBy,
    sortOrder,
    page,
    limit,
    groupByMode,
  ]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isGrouped = groupByMode !== 'none';
  const isDataActuallyGrouped =
    Array.isArray(data) && data.length > 0 && Array.isArray((data[0] as any)?.items);
  const hasActiveFilters =
    Boolean(searchName.trim()) || selectedCategoryId !== 'all' || dynamicFilters.length > 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 pb-10">
      {/* Compact Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              GL
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-slate-900 tracking-tight">
                Gogolabs Catalog
              </span>
              <span className="text-[11px] text-slate-500 hidden sm:inline">Admin Management</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 text-slate-700 rounded-md border border-slate-200 font-medium">
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>500k Postgres</span>
            </div>
            {meta?.executionTimeMs !== undefined && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200 font-semibold tabular-nums">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>{meta.executionTimeMs} ms</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
        {/* Compact Controls Card */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3.5 mb-3">
          {/* Top Controls Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            {/* Quick Search */}
            <div className="md:col-span-4 relative">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari nama produk (e.g. Galaxy, 5X, ROG)..."
                  value={searchName}
                  onChange={(e) => {
                    setSearchName(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
                />
                {searchName && (
                  <button
                    onClick={() => {
                      setSearchName('');
                      setPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Dropdown */}
            <div className="md:col-span-3">
              <select
                value={selectedCategoryId}
                onChange={(e) => {
                  setSelectedCategoryId(e.target.value);
                  setPage(1);
                }}
                disabled={loadingCategories}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
              >
                <option value="all">Semua Kategori ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Grouping Mode */}
            <div className="md:col-span-3">
              <select
                value={groupByMode}
                onChange={(e) => handleGroupByChange(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-blue-50/50 border border-blue-200 text-blue-900 font-semibold rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all"
              >
                <option value="none">Flat Table (Tanpa Grup)</option>
                <option value="category">Group: Kategori Produk</option>
                <option value="date_month">Group: Bulan Dibuat</option>
                <option value="date_day">Group: Tanggal Dibuat</option>
                <option value="price_bucket">Group: Range Harga (5 Juta)</option>
              </select>
            </div>

            {/* Sort & Order Button */}
            <div className="md:col-span-2 flex items-center gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
              >
                <option value="createdAt">Tanggal</option>
                <option value="price">Harga</option>
                <option value="name">Nama</option>
                <option value="category.name">Kategori</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors"
                title="Ganti Urutan"
              >
                <ArrowUpDown className="w-3 h-3 text-blue-600" />
                <span>{sortOrder.toUpperCase()}</span>
              </button>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all border ${
                  showAdvancedFilters || dynamicFilters.length > 0
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Filter Lanjutan</span>
                {dynamicFilters.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-blue-600 text-white rounded-full text-[10px] font-bold">
                    {dynamicFilters.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={addDynamicFilter}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium border border-slate-200 transition-colors"
              >
                <Plus className="w-3 h-3 text-blue-600" />
                <span>Tambah Rule</span>
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 hover:bg-rose-50 rounded-md transition-colors"
                >
                  Reset Filter
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-slate-500 text-[11px]">
              {meta && (
                <span className="tabular-nums">
                  Ditemukan <strong>{meta.totalCount.toLocaleString()}</strong> produk
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchProducts()}
                className="p-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100 transition-colors"
                title="Muat Ulang"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Compact Dynamic Multi-Filter Builder Panel */}
          {showAdvancedFilters && (
            <div className="mt-3 pt-3 border-t border-slate-200 bg-slate-50/80 p-3 rounded-lg border border-slate-200/80">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Kondisi Multi-Filter:
                  </span>
                  <div className="inline-flex rounded-md p-0.5 bg-slate-200 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setFilterLogic('AND')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                        filterLogic === 'AND'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      AND (Semua)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterLogic('OR')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                        filterLogic === 'OR'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      OR (Salah Satu)
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addDynamicFilter}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Tambah Baris
                </button>
              </div>

              {dynamicFilters.length === 0 ? (
                <div className="text-center py-4 text-slate-400 text-xs bg-white rounded-lg border border-dashed border-slate-200">
                  Belum ada filter lanjutan. Klik{' '}
                  <span
                    className="text-blue-600 font-semibold cursor-pointer underline"
                    onClick={addDynamicFilter}
                  >
                    Tambah Baris
                  </span>{' '}
                  untuk memfilter dengan operator spesifik.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {dynamicFilters.map((rule, idx) => {
                    const availableOps = getOperatorsForField(rule.field);
                    const isNullOp = rule.operator === 'is_null' || rule.operator === 'is_not_null';

                    return (
                      <div
                        key={rule.id}
                        className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-white p-2 rounded-lg border border-slate-200 shadow-2xs"
                      >
                        <span className="text-[11px] font-bold text-slate-400 w-8 text-center shrink-0">
                          {idx === 0 ? 'WHERE' : filterLogic}
                        </span>

                        {/* Field */}
                        <div className="w-full sm:w-40 shrink-0">
                          <select
                            value={rule.field}
                            onChange={(e) =>
                              updateDynamicFilter(rule.id, { field: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-800"
                          >
                            {FILTER_FIELDS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Operator */}
                        <div className="w-full sm:w-44 shrink-0">
                          <select
                            value={rule.operator}
                            onChange={(e) =>
                              updateDynamicFilter(rule.id, {
                                operator: e.target.value as FilterOperator,
                              })
                            }
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-blue-900"
                          >
                            {availableOps.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Value Input */}
                        <div className="w-full sm:flex-1">
                          {isNullOp ? (
                            <span className="text-[11px] text-slate-400 italic px-2">
                              (Tidak butuh input nilai)
                            </span>
                          ) : rule.field === 'categoryId' ? (
                            <select
                              value={rule.value}
                              onChange={(e) =>
                                updateDynamicFilter(rule.id, { value: e.target.value })
                              }
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                            >
                              <option value="">-- Pilih Kategori --</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : rule.field === 'createdAt' ? (
                            <input
                              type="date"
                              value={rule.value}
                              onChange={(e) =>
                                updateDynamicFilter(rule.id, { value: e.target.value })
                              }
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                            />
                          ) : rule.field === 'price' ? (
                            <input
                              type="number"
                              placeholder={
                                rule.operator === 'in' || rule.operator === 'not_in'
                                  ? '100000, 250000'
                                  : '50000'
                              }
                              value={rule.value}
                              onChange={(e) =>
                                updateDynamicFilter(rule.id, { value: e.target.value })
                              }
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs tabular-nums"
                            />
                          ) : (
                            <input
                              type="text"
                              placeholder="Nilai kata kunci..."
                              value={rule.value}
                              onChange={(e) =>
                                updateDynamicFilter(rule.id, { value: e.target.value })
                              }
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                            />
                          )}
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeDynamicFilter(rule.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors shrink-0"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Error Notification */}
        {error && (
          <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <span>
              <strong>Error:</strong> {error}
            </span>
            <button
              onClick={() => fetchProducts()}
              className="px-2.5 py-1 bg-rose-600 text-white rounded text-xs font-semibold hover:bg-rose-700"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Dense / Compact Table Card */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Nama Produk</th>
                  <th className="py-2.5 px-3">Kategori</th>
                  <th className="py-2.5 px-3 text-right">Harga</th>
                  <th className="py-2.5 px-3">Tanggal Dibuat</th>
                  <th className="py-2.5 px-3 text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Loading State */}
                {loading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                      <span className="text-xs font-medium text-slate-600">
                        Memuat data dari PostgreSQL...
                      </span>
                    </td>
                  </tr>
                )}

                {/* Empty State */}
                {!loading && data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <p className="text-xs font-medium text-slate-600">
                        Tidak ada produk yang cocok dengan filter.
                      </p>
                    </td>
                  </tr>
                )}

                {/* MODE GROUPED TABLE */}
                {!loading &&
                  isGrouped &&
                  isDataActuallyGrouped &&
                  (data as GroupedData[]).map((group, groupIdx) => {
                    const isCollapsed = collapsedGroups[group.groupKey];
                    const items = Array.isArray(group.items) ? group.items : [];

                    return (
                      <React.Fragment key={group.groupKey || groupIdx}>
                        {/* Compact Group Header */}
                        <tr
                          onClick={() => toggleGroupCollapse(group.groupKey)}
                          className="bg-slate-100/90 hover:bg-slate-200/70 cursor-pointer select-none border-t border-slate-200 transition-colors"
                        >
                          <td colSpan={6} className="py-2 px-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isCollapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                )}
                                {groupByMode === 'category' && (
                                  <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                                )}
                                {groupByMode.startsWith('date') && (
                                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                                )}
                                {groupByMode === 'price_bucket' && (
                                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                                )}
                                <span className="text-xs font-bold text-slate-900">
                                  {group.groupLabel}
                                </span>
                                {group.groupMeta?.slug && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 font-medium">
                                    {group.groupMeta.slug}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 tabular-nums">
                                {group.totalItems} item
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Items under this group */}
                        {!isCollapsed &&
                          items.map((product, pIdx) => (
                            <tr
                              key={product.id || pIdx}
                              className="hover:bg-slate-50 transition-colors"
                            >
                              <td className="py-2 px-3 text-[11px] text-slate-400 text-center tabular-nums">
                                {pIdx + 1}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900 pl-7">
                                {product.name}
                              </td>
                              <td className="py-2 px-3">
                                {product.category ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                                    <Tag className="w-2.5 h-2.5 text-slate-400" />
                                    {product.category.name}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">
                                    Tanpa Kategori
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-slate-900 tabular-nums">
                                Rp {Number(product.price || 0).toLocaleString('id-ID')}
                              </td>
                              <td className="py-2 px-3 text-[11px] text-slate-500 tabular-nums">
                                {product.createdAt
                                  ? new Date(product.createdAt).toLocaleDateString('id-ID', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : '-'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button className="text-[11px] font-medium text-blue-600 hover:text-blue-800">
                                  Kelola
                                </button>
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}

                {/* MODE FLAT TABLE */}
                {!loading &&
                  !isGrouped &&
                  !isDataActuallyGrouped &&
                  (data as Product[]).map((product, pIdx) => (
                    <tr
                      key={product.id || pIdx}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2 px-3 text-[11px] text-slate-400 text-center tabular-nums">
                        {(page - 1) * limit + pIdx + 1}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900">{product.name}</td>
                      <td className="py-2 px-3">
                        {product.category ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                            <Tag className="w-2.5 h-2.5 text-slate-400" />
                            {product.category.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Tanpa Kategori</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-900 tabular-nums">
                        Rp {Number(product.price || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-500 tabular-nums">
                        {product.createdAt
                          ? new Date(product.createdAt).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '-'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button className="text-[11px] font-medium text-blue-600 hover:text-blue-800">
                          Kelola
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Compact Pagination Bar */}
          {meta && (
            <div className="bg-white px-3.5 py-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="tabular-nums">
                  Menampilkan{' '}
                  <strong className="text-slate-900">
                    {Math.min(meta.totalCount, (meta.page - 1) * meta.limit + 1)}
                  </strong>
                  -
                  <strong className="text-slate-900">
                    {Math.min(meta.totalCount, meta.page * meta.limit)}
                  </strong>{' '}
                  dari{' '}
                  <strong className="text-slate-900">{meta.totalCount.toLocaleString()}</strong>
                </span>
                {meta.totalGroups !== undefined && (
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-semibold border border-blue-100">
                    {meta.totalGroups} Grup
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className="text-[11px]">Baris:</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-xs tabular-nums"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    disabled={!meta.hasPrevPage}
                    onClick={() => setPage(page - 1)}
                    className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors"
                    title="Sebelumnya"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-xs px-1.5 font-medium text-slate-700 tabular-nums">
                    {meta.page} / {meta.totalPages.toLocaleString()}
                  </span>

                  <button
                    disabled={!meta.hasNextPage}
                    onClick={() => setPage(page + 1)}
                    className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors"
                    title="Selanjutnya"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
