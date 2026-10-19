"use client";

import type { StoreSummary } from "@profitlens/core";
import { createContext, useContext, type ReactNode } from "react";

const StoresContext = createContext<readonly StoreSummary[]>([]);

export function StoresProvider({ stores, children }: { stores: readonly StoreSummary[]; children: ReactNode }) {
  return <StoresContext.Provider value={stores}>{children}</StoresContext.Provider>;
}

export function useStores(): readonly StoreSummary[] {
  return useContext(StoresContext);
}

/** The store shown when the URL names none: the first connected store, else the demo store. */
export function useDefaultStoreId(): string {
  const stores = useStores();
  return (stores.find((s) => !s.isDemo) ?? stores[0])?.id ?? "demo";
}
