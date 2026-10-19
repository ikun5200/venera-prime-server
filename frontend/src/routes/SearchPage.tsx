import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Search, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore, toast } from '../lib/store';
import { useT } from '../lib/i18n';
import { cn, copyText, parseOption } from '../lib/utils';
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from '../components/ui';
import { PageBody } from '../components/PageHeader';

interface SearchOption {
  label?: string;
  type?: 'select' | 'multi-select' | 'dropdown';
  options?: string[];
  default?: string;
}

export default function SearchPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = useAppStore((state) => state.settings);
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources });
  const history = useQuery({ queryKey: ['search-history'], queryFn: api.searchHistory });

  const searchable = useMemo(
    () => (sources.data?.items ?? []).filter((source) => source.enabled && source.capabilities.search === true),
    [sources.data],
  );

  const defaultTarget = String(settings.defaultSearchTarget ?? '');
  const [aggregated, setAggregated] = useState(defaultTarget === '_aggregated_');
  const [sourceKey, setSourceKey] = useState('');
  const [keyword, setKeyword] = useState('');
  const [optionValues, setOptionValues] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (sourceKey || searchable.length === 0) return;
    const preferred = searchable.find((source) => source.key === defaultTarget);
    setSourceKey((preferred ?? searchable[0]).key);
  }, [defaultTarget, searchable, sourceKey]);

  const source = searchable.find((item) => item.key === sourceKey);
  const optionDefs = useMemo<SearchOption[]>(() => {
    const raw = source?.capabilities.searchOptions;
    return Array.isArray(raw) ? (raw as SearchOption[]) : [];
  }, [source]);

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const option of optionDefs) {
      const label = option.label ?? '';
      if (option.type === 'multi-select') {
        next[label] = option.default ? option.default.split('|') : [];
      } else if (option.default !== undefined) {
        next[label] = [String(option.default)];
      } else if (option.options && option.options.length > 0) {
        next[label] = [parseOption(option.options[0]).value];
      } else {
        next[label] = [];
      }
    }
    setOptionValues(next);
  }, [optionDefs]);

  const addHistory = useMutation({
    mutationFn: (value: string) => api.addSearchHistory(value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['search-history'] }),
  });
  const clearHistory = useMutation({
    mutationFn: api.clearSearchHistory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['search-history'] }),
  });

  const submit = () => {
    const value = keyword.trim();
    if (!value) return;
    addHistory.mutate(value);
    if (aggregated) {
      navigate(`/search/aggregated?q=${encodeURIComponent(value)}`);
      return;
    }
    if (!sourceKey) {
      toast.error('Select a source first');
      return;
    }
    const options = optionDefs
      .map((option) => (optionValues[option.label ?? ''] ?? []).join('|'))
      .filter(Boolean);
    const params = new URLSearchParams({ source: sourceKey, q: value, page: '1' });
    if (options.length) params.set('options', options.join(','));
    navigate(`/search/result?${params}`);
  };

  if (sources.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (searchable.length === 0) {
    return (
      <PageBody>
        <EmptyState
          title={t('No Search Sources')}
          description={t('Please add some sources')}
          action={
            <Button variant="primary" onClick={() => navigate('/sources')}>
              {t('Manage')}
            </Button>
          }
        />
      </PageBody>
    );
  }

  return (
    <PageBody className="max-w-[900px]">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{t('Search')}</h1>
        <p className="text-[13px] text-muted">Search across your installed comic sources.</p>
      </div>

      <Card className="p-4 md:p-5">
        <div className="flex gap-2">
          <Input
            autoFocus
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
            placeholder={t('Search comics')}
            className="h-11 text-[15px]"
          />
          <Button variant="primary" className="h-11 shrink-0" onClick={submit}>
            <Search className="h-4 w-4" />
            {t('Search')}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-muted">{t('Search in')}</span>
          {searchable.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setAggregated(false);
                setSourceKey(item.key);
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] transition-colors duration-100',
                !aggregated && item.key === sourceKey
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface2 text-muted hover:text-fg',
              )}
            >
              {item.name}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[12px] text-muted">
            <input
              type="checkbox"
              checked={aggregated}
              onChange={(event) => setAggregated(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-[rgb(var(--accent))]"
            />
            {t('Aggregated Search')}
          </label>
        </div>

        {!aggregated && optionDefs.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
            {optionDefs.map((option) => {
              const label = option.label ?? '';
              const values = optionValues[label] ?? [];
              if (option.type === 'dropdown') {
                return (
                  <Field key={label} label={label || 'Option'}>
                    <Select
                      value={values[0] ?? ''}
                      onChange={(event) =>
                        setOptionValues({ ...optionValues, [label]: [event.target.value] })
                      }
                    >
                      <option value="">Any</option>
                      {(option.options ?? []).map((raw) => {
                        const parsed = parseOption(raw);
                        return (
                          <option key={parsed.value} value={parsed.value}>
                            {parsed.text}
                          </option>
                        );
                      })}
                    </Select>
                  </Field>
                );
              }
              return (
                <div key={label} className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[12px] font-medium text-muted">{label}</span>
                  {(option.options ?? []).map((raw) => {
                    const parsed = parseOption(raw);
                    const selected = values.includes(parsed.value);
                    return (
                      <button
                        key={parsed.value}
                        onClick={() => {
                          if (option.type === 'multi-select') {
                            setOptionValues({
                              ...optionValues,
                              [label]: selected
                                ? values.filter((value) => value !== parsed.value)
                                : [...values, parsed.value],
                            });
                          } else {
                            setOptionValues({ ...optionValues, [label]: [parsed.value] });
                          }
                        }}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-100',
                          selected
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border bg-surface text-muted hover:text-fg',
                        )}
                      >
                        {parsed.text}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">{t('Search History')}</h2>
          {(history.data?.items.length ?? 0) > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => clearHistory.mutate()}
              loading={clearHistory.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('Clear Search History')}
            </Button>
          ) : null}
        </div>
        {history.isLoading ? (
          <Spinner />
        ) : (history.data?.items.length ?? 0) === 0 ? (
          <p className="text-[13px] text-muted">No search history yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {history.data?.items.map((item) => (
              <div
                key={item.keyword}
                className="group flex items-center gap-2 rounded px-2 py-2 hover:bg-surface2"
              >
                <button
                  className="flex-1 truncate text-left text-[13px]"
                  onClick={() => {
                    setKeyword(item.keyword);
                    setAggregated(false);
                  }}
                >
                  {item.keyword}
                </button>
                <button
                  aria-label="Copy"
                  className="rounded p-1.5 text-muted opacity-0 hover:text-fg group-hover:opacity-100"
                  onClick={() => copyText(item.keyword).then(() => toast.success('Copied'))}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label="Clear"
                  className="rounded p-1.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                  onClick={() => clearHistory.mutate()}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageBody>
  );
}
