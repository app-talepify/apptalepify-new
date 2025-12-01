// Shared filtering helpers for list and map

export const normalizeListingType = (portfolio) => {
  const statusStr = String(portfolio?.listingStatus || '').toLowerCase();
  const inferred = statusStr.includes('sat') ? 'Satılık' : (statusStr.includes('kira') ? 'Kiralık' : '');
  return portfolio?.listingType || inferred || '';
};

export const isPointInPolygon = (point, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const denom = (yj - yi);
    if (denom === 0) continue;
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export const matchesFilters = (portfolio, filters) => {
  if (!filters || typeof filters !== 'object') return true;
  const priceRange = Array.isArray(filters.priceRange) ? filters.priceRange : [0, Number.POSITIVE_INFINITY];
  const price = Number(portfolio?.price) || 0;
  if (price < priceRange[0] || price > priceRange[1]) return false;

  if (filters.listingType) {
    const type = normalizeListingType(portfolio);
    if (type !== filters.listingType) return false;
  }

  if (filters.propertyType && portfolio?.propertyType !== filters.propertyType) return false;

  if (filters.propertyType === 'Daire' || filters.propertyType === 'Villa') {
    const areaRange = Array.isArray(filters.areaRange) ? filters.areaRange : [0, Number.POSITIVE_INFINITY];
    const area = Number(portfolio?.area) || 0;
    if (area < areaRange[0] || area > areaRange[1]) return false;

    if (filters.rooms?.length > 0) {
      const rooms = portfolio?.rooms || portfolio?.roomCount || '';
      if (!filters.rooms.includes(rooms)) return false;
    }

    const buildingAgeRange = Array.isArray(filters.buildingAgeRange) ? filters.buildingAgeRange : [0, Number.POSITIVE_INFINITY];
    const buildingAge = Number(portfolio?.buildingAge) || 0;
    if (buildingAge < buildingAgeRange[0] || buildingAge > buildingAgeRange[1]) return false;

    const floorNumberRange = Array.isArray(filters.floorNumberRange) ? filters.floorNumberRange : [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    const floor = Number(portfolio?.floorNumber) || 0;
    const totalFloorsRange = Array.isArray(filters.totalFloorsRange) ? filters.totalFloorsRange : [0, Number.POSITIVE_INFINITY];
    const totalFloors = Number(portfolio?.totalFloors) || 0;
    if (floor < floorNumberRange[0] || floor > floorNumberRange[1]) return false;
    if (totalFloors < totalFloorsRange[0] || totalFloors > totalFloorsRange[1]) return false;

    if (filters.parentalBathroom && !portfolio?.parentBathroom) return false;
    if (filters.exchange && !portfolio?.exchange) return false;
    if (filters.kitchenType && portfolio?.kitchenType !== filters.kitchenType) return false;
    if (filters.usageStatus && portfolio?.usageStatus !== filters.usageStatus) return false;
    if (filters.titleDeedStatus && portfolio?.titleDeedStatus !== filters.titleDeedStatus) return false;

    if (filters.bathroomCount) {
      const bc = portfolio?.bathroomCount ? Number(portfolio.bathroomCount) : 0;
      if (filters.bathroomCount === '4+') {
        if (bc < 4) return false;
      } else if (bc !== Number(filters.bathroomCount)) return false;
    }

    if (filters.balconyCount) {
      const bc = portfolio?.balconyCount !== undefined && portfolio?.balconyCount !== null
        ? Number(portfolio.balconyCount) : 0;
      if (filters.balconyCount === '3+') {
        if (bc < 3) return false;
      } else if (bc !== Number(filters.balconyCount)) return false;
    }

    if (filters.hasParking && !portfolio?.parking) return false;
    if (filters.hasGlassBalcony && !portfolio?.glassBalcony) return false;
    if (filters.hasDressingRoom && !portfolio?.dressingRoom) return false;
    if (filters.isFurnished && !portfolio?.furnished) return false;
    if (filters.heatingType && portfolio?.heatingType !== filters.heatingType) return false;
    if (filters.occupancyStatus && portfolio?.occupancyStatus !== filters.occupancyStatus) return false;
  }

  return true;
};

export const filterByPolygon = (portfolios, polygon) => {
  if (!Array.isArray(polygons) && (!polygon || !Array.isArray(polygon) || polygon.length < 3)) return [];
  const list = Array.isArray(portfolios) ? portfolios : [];
  return list.filter((p) => {
    const lng = Number(p?.coordinates?.longitude);
    const lat = Number(p?.coordinates?.latitude);
    if (Number.isNaN(lng) || Number.isNaN(lat)) return false;
    return isPointInPolygon([lng, lat], polygon);
  });
};


