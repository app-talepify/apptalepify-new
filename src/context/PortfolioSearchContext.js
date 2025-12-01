import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPortfolios } from '../services/firestore';

const PortfolioSearchContext = createContext(null);

export const PortfolioSearchProvider = ({ children }) => {
  const [portfolios, setPortfolios] = useState([]);
  const [filters, setFilters] = useState({
    priceRange: [0, 20000000],
    propertyType: '',
    listingType: '',
    creditLimit: '',
    rooms: [],
    areaRange: [0, 500],
    buildingAgeRange: [0, 50],
    totalFloorsRange: [0, 50],
    floorNumberRange: [0, 50],
    parentalBathroom: false,
    exchange: false,
    kitchenType: '',
    usageStatus: '',
    titleDeedStatus: '',
    bathroomCount: '',
    balconyCount: '',
    hasParking: false,
    hasGlassBalcony: false,
    hasDressingRoom: false,
    isFurnished: false,
    heatingType: '',
    occupancyStatus: '',
  });
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasBootstrappedRef = useRef(false);
  const CACHE_KEY = 'portfolios_cache_v1';

  const loadPortfolios = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPortfolios({}, true);
      setPortfolios(data || []);
      // Cache to storage for fast next-load
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items: data || [] }));
      } catch {}
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Bootstrap from cache, then refresh in background
  useEffect(() => {
    if (hasBootstrappedRef.current) return;
    hasBootstrappedRef.current = true;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Array.isArray(parsed.items)) {
            setPortfolios(parsed.items);
          }
        }
      } catch {}
      // Always refresh in background
      try {
        await loadPortfolios();
      } catch {}
    })();
  }, [loadPortfolios]);

  const clearFilters = useCallback(() => {
    setFilters({
      priceRange: [0, 20000000],
      propertyType: '',
      listingType: '',
      creditLimit: '',
      rooms: [],
      areaRange: [0, 500],
      buildingAgeRange: [0, 50],
      totalFloorsRange: [0, 50],
      floorNumberRange: [0, 50],
      parentalBathroom: false,
      exchange: false,
      kitchenType: '',
      usageStatus: '',
      titleDeedStatus: '',
      bathroomCount: '',
      balconyCount: '',
      hasParking: false,
      hasGlassBalcony: false,
      hasDressingRoom: false,
      isFurnished: false,
      heatingType: '',
      occupancyStatus: '',
    });
    setHasAppliedFilters(false);
  }, []);

  const clearPolygon = useCallback(() => {
    setDrawnPolygon(null);
  }, []);

  const value = useMemo(() => ({
    portfolios,
    setPortfolios,
    filters,
    setFilters,
    hasAppliedFilters,
    setHasAppliedFilters,
    drawnPolygon,
    setDrawnPolygon,
    clearPolygon,
    loadPortfolios,
    loading,
    error,
    clearFilters,
  }), [portfolios, filters, hasAppliedFilters, drawnPolygon, loadPortfolios, loading, error, clearFilters, clearPolygon]);

  return (
    <PortfolioSearchContext.Provider value={value}>
      {children}
    </PortfolioSearchContext.Provider>
  );
};

export const usePortfolioSearch = () => useContext(PortfolioSearchContext);


