"use client";

import type { ResidentListQuery } from "@pg/shared";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

/**
 * Backend-driven resident search-as-you-type dropdown — shows name + phone,
 * debounced, reuses the existing `GET /residents?q=` list endpoint (no
 * dedicated search route). Originally built for the complaints filter;
 * `status`/`limit` are caller-configurable so other call sites (e.g. "referred
 * by" on registration) can narrow the pool differently.
 */
export function ResidentCombobox({
  initialResidentId,
  onChange,
  status = "ALL",
  limit = 8,
  placeholder = "Search resident…",
}: {
  initialResidentId?: string;
  onChange: (id: string | undefined) => void;
  status?: ResidentListQuery["status"];
  limit?: number;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [results, setResults] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // On mount with a pre-selected resident (e.g. from a URL param), fetch their name.
  useEffect(() => {
    if (!initialResidentId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.residents.get(initialResidentId);
        if (!cancelled) {
          setSelectedName(r.name);
          setInputValue(r.name);
        }
      } catch {
        // If fetch fails, just leave the input blank — the list will still filter correctly.
      }
    })();
    return () => { cancelled = true; };
  }, [initialResidentId]);

  // Debounce the search input and call the residents API.
  useEffect(() => {
    const q = inputValue.trim();
    if (selectedName !== null || q.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const result = await api.residents.list({ q, status, limit });
        setResults(result.items.map((r) => ({ id: r.id, name: r.name, phone: r.phone })));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [inputValue, selectedName, status, limit]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (id: string, name: string) => {
    setSelectedName(name);
    setInputValue(name);
    setOpen(false);
    setResults([]);
    onChange(id);
  };

  const clear = () => {
    setSelectedName(null);
    setInputValue("");
    setResults([]);
    setOpen(false);
    onChange(undefined);
  };

  return (
    <div ref={containerRef} className="relative w-full sm:w-64">
      <div className="relative">
        <Input
          value={inputValue}
          onChange={(e) => {
            setSelectedName(null);
            setInputValue(e.target.value);
          }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder}
          className={selectedName ? "pr-8" : undefined}
          autoComplete="off"
        />
        {selectedName && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear resident selection"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {searching && !selectedName && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            …
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg animate-pop-in">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep input focused until select
                onClick={() => select(r.id, r.name)}
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
