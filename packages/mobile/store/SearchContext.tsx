import React, { createContext, useContext, useState, useCallback } from 'react';

interface SearchContextType {
  isSearchVisible: boolean;
  toggleSearch: () => void;
  showSearch: () => void;
  hideSearch: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const toggleSearch = useCallback(() => {
    setIsSearchVisible(prev => !prev);
  }, []);

  const showSearch = useCallback(() => {
    setIsSearchVisible(true);
  }, []);

  const hideSearch = useCallback(() => {
    setIsSearchVisible(false);
  }, []);

  return (
    <SearchContext.Provider value={{ isSearchVisible, toggleSearch, showSearch, hideSearch }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
