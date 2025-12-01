// Utilities for matching portfolios to a request with tolerance rules

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined) {return fallback;}
  if (typeof value === 'number') {return Number.isFinite(value) ? value : fallback;}
  try {
    let s = String(value).trim();
    // Handle common Turkish formats: remove thousand separators, convert comma to dot
    s = s.replace(/\./g, '');
    s = s.replace(/,/g, '.');
    // Extract first valid numeric (e.g., "3. Kat" -> 3)
    const m = s.match(/-?\d+(?:\.\d+)?/);
    const parsed = m ? parseFloat(m[0]) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
};

const parseFloor = (value) => {
  if (value === null || value === undefined) {return NaN;}
  const raw = normalizeText(String(value));
  if (!raw) {return NaN;}
  if (raw.includes('bodrum') || raw.includes('bahce') || raw.includes('bahce kati') || raw.includes('yarı bodrum') || raw.includes('yari bodrum')) {return -1;}
  if (raw.includes('giris') || raw.includes('zemin') || raw.includes('yuksek giris') || raw.includes('yüksek giris') || raw.includes('yuksekgiris')) {return 0;}
  if (raw.includes('cati') || raw.includes('c\u0327ati') || raw.includes('teras')) {return 99;}
  return toNumber(raw, NaN);
};

const parseBuildingAge = (value) => {
  if (value === null || value === undefined) {return NaN;}
  const raw = normalizeText(String(value));
  if (!raw) {return NaN;}
  if (raw.includes('sifir') || raw.includes('0')) {return 0;}
  return toNumber(raw, NaN);
};

const normalizeRoomToken = (v) => normalizeText(String(v || '')).replace(/\s+/g, '');
const normalizeRoomCount = (value) => {
  if (Array.isArray(value)) {return value.map((v) => normalizeRoomToken(v));}
  if (value == null) {return [];} 
  return [normalizeRoomToken(value)];
};

const transliterateTurkish = (s) => {
  return s
    .replace(/İ/g, 'I')
    .replace(/I/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u');
};

const normalizeText = (value) => {
  if (!value && value !== 0) {return '';} 
  try {
    let s = String(value).trim();
    // Turkish-specific transliteration first (handles ı/İ)
    s = transliterateTurkish(s);
    // Lowercase after transliteration
    s = s.toLowerCase();
    // Remove common punctuation and excessive whitespace
    s = s.replace(/[\.\-_,]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  } catch {
    return String(value).toLowerCase();
  }
};

const normalizeNeighborhood = (value) => {
  let s = normalizeText(value);
  s = s.replace(/\bmahallesi\b/g, '').replace(/\bmah\b/g, '').replace(/\bmh\b/g, '');
  return s.trim();
};

const equalsNormalized = (a, b) => normalizeText(a) === normalizeText(b);
const includesNormalized = (arr, value, isNeighborhood = false) => {
  const target = isNeighborhood ? normalizeNeighborhood(value) : normalizeText(value);
  const list = Array.isArray(arr) ? arr : [];
  return list.some((x) => (isNeighborhood ? normalizeNeighborhood(x) : normalizeText(x)) === target);
};

const normalizeListingStatus = (value) => {
  if (!value) {return '';} 
  const s = String(value).toLowerCase();
  if (s.includes('kira')) {return 'Kiralık';}
  if (s.includes('sat')) {return 'Satılık';}
  return value;
};

const normalizePropertyType = (value) => {
  const s = normalizeText(value);
  if (!s) {return '';} 
  if (s.includes('residence') || s.includes('rezidans') || s.includes('apart')) {return 'daire';}
  if (s.includes('daire') || s.includes('apartment')) {return 'daire';}
  if (s.includes('villa')) {return 'villa';}
  if (s.includes('isyeri') || s.includes('is yeri') || s.includes('d\u00fc\u011f\u00fcn') || s.includes('ofis') || s.includes('büro') || s.includes('dukkan') || s.includes('dükkan') || s.includes('magaza') || s.includes('ma\u011faza')) {return 'isyeri';}
  if (s.includes('arsa') || s.includes('arazi') || s.includes('tarla')) {return 'arsa';}
  if (s.includes('bina')) {return 'bina';}
  return s;
};

const inListOrEmpty = (value, allowedList) => {
  if (!allowedList || allowedList.length === 0) {return true;}
  if (value == null || value === '') {return false;}
  return allowedList.includes(value);
};

const withinTolerance = (target, min, max, toleranceRatio = 0.1) => {
  // Expands [min,max] by tolerance. If only one bound exists, expand that side.
  const hasMin = min != null && min !== '';
  const hasMax = max != null && max !== '';
  const t = toNumber(target, NaN);
  if (!Number.isFinite(t)) {return false;}

  if (!hasMin && !hasMax) {return true;}

  let lo = -Infinity;
  let hi = Infinity;
  if (hasMin) {
    const m = toNumber(min, 0);
    lo = m * (1 - toleranceRatio);
  }
  if (hasMax) {
    const m = toNumber(max, 0);
    hi = m * (1 + toleranceRatio);
  }
  return t >= lo && t <= hi;
};

export function getMatchingPortfoliosForRequest(request, portfolios, options = {}) {
  if (!request || !Array.isArray(portfolios) || portfolios.length === 0) {return [];} 

  const tolerance = options.tolerance ?? 0.10; // 10%
  const ignoreLocation = options.ignoreLocation ?? false; // When true, skip city/district/neighborhood filters

  // Location fields
  const city = request.city || '';
  const requestDistricts = Array.isArray(request.districts)
    ? request.districts
    : (request.district ? [request.district] : []);
  const requestNeighborhoods = Array.isArray(request.neighborhoods)
    ? request.neighborhoods
    : (request.neighborhood ? [request.neighborhood] : []);

  const requestRooms = normalizeRoomCount(request.roomCount);
  const propertyType = request.propertyType || '';
  const listingStatus = normalizeListingStatus(request.listingStatus || request.listingType || '');

  // Price: supports min/max or single budget
  const minPrice = request.minPrice ?? (request.budget ? request.budget : undefined);
  const maxPrice = request.maxPrice ?? (request.budget ? request.budget : undefined);

  // Area (m²)
  const minSqm = request.minSquareMeters;
  const maxSqm = request.maxSquareMeters;

  // Building age and preferred floor ranges
  const minBuildingAge = request.minBuildingAge ?? (Array.isArray(request.buildingAge) ? request.buildingAge[0] : undefined);
  const maxBuildingAge = request.maxBuildingAge ?? (Array.isArray(request.buildingAge) ? request.buildingAge[1] : undefined);
  const minFloor = request.minFloor ?? (Array.isArray(request.floor) ? request.floor[0] : undefined);
  const maxFloor = request.maxFloor ?? (Array.isArray(request.floor) ? request.floor[1] : undefined);

  const filtered = portfolios.filter((p) => {
    // isPublished portfolios only
    if (p.isPublished === false) {return false;}

    // City match: exact
    if (!ignoreLocation) {
      if (city) {
        if (!p.city || !equalsNormalized(p.city, city)) {return false;}
      }
    }

    // District match: exact within selected set
    if (!ignoreLocation) {
      if (requestDistricts.length > 0) {
        if (!p.district || !includesNormalized(requestDistricts, p.district)) {return false;}
      }
    }

    // Neighborhood match: exact within selected set
    if (!ignoreLocation) {
      if (requestNeighborhoods.length > 0) {
        if (!p.neighborhood || !includesNormalized(requestNeighborhoods, p.neighborhood, true)) {return false;}
      }
    }

    // Property type match
    if (propertyType) {
      const reqType = normalizePropertyType(propertyType);
      const pType = normalizePropertyType(p.propertyType);
      if (!pType || pType !== reqType) {return false;}
    }

    // Listing type/status match if provided on request
    if (listingStatus) {
      const pStatus = normalizeListingStatus(p.listingStatus || p.listingType || '');
      if (!pStatus || pStatus !== listingStatus) {return false;}
    }

    // Rooms match if provided
    if (requestRooms.length > 0) {
      const portfolioRooms = normalizeRoomCount(p.roomCount || p.rooms);
      if (portfolioRooms.length === 0) {return false;}
      const anyMatch = portfolioRooms.some((r) => requestRooms.includes(r));
      if (!anyMatch) {return false;}
    }

    // Price with ±tolerance
    const priceOk = withinTolerance(p.price, minPrice, maxPrice, tolerance);
    if (!priceOk) {return false;}

  // Square meters with ±tolerance (support multiple schema variants)
  const sqmValue =
    (p.squareMeters != null && p.squareMeters !== '') ? p.squareMeters :
    (p.netSquareMeters != null && p.netSquareMeters !== '') ? p.netSquareMeters :
    (p.grossSquareMeters != null && p.grossSquareMeters !== '') ? p.grossSquareMeters :
    p.area;
    const sqmOk = withinTolerance(sqmValue, minSqm, maxSqm, tolerance);
    if (!sqmOk) {return false;}

    // Building age within tolerance if request specified
    if (minBuildingAge != null || maxBuildingAge != null) {
      const ageOk = withinTolerance(parseBuildingAge(p.buildingAge), minBuildingAge, maxBuildingAge, tolerance);
      if (!ageOk) {return false;}
    }

    // Preferred floor within tolerance if request specified
    if (minFloor != null || maxFloor != null) {
      const floorValue = (p.floor != null && p.floor !== '') ? p.floor : p.floorNumber;
      const floorOk = withinTolerance(parseFloor(floorValue), minFloor, maxFloor, tolerance);
      if (!floorOk) {return false;}
    }

    return true;
  });

  // Sort by closeness to price and sqm center (if provided), else by newest
  const priceCenter = (minPrice != null && maxPrice != null)
    ? (toNumber(minPrice, 0) + toNumber(maxPrice, 0)) / 2
    : (minPrice != null ? toNumber(minPrice, 0) : (maxPrice != null ? toNumber(maxPrice, 0) : null));

  const sqmCenter = (minSqm != null && maxSqm != null)
    ? (toNumber(minSqm, 0) + toNumber(maxSqm, 0)) / 2
    : (minSqm != null ? toNumber(minSqm, 0) : (maxSqm != null ? toNumber(maxSqm, 0) : null));

  const scored = filtered.map((p) => {
    const price = toNumber(p.price, 0);
    const sqm = toNumber((p.squareMeters != null ? p.squareMeters : p.area), 0);
    const priceDiff = priceCenter != null ? Math.abs(price - priceCenter) / Math.max(1, priceCenter) : 0;
    const sqmDiff = sqmCenter != null ? Math.abs(sqm - sqmCenter) / Math.max(1, sqmCenter) : 0;
    const score = priceDiff + sqmDiff; // lower is better
    return { portfolio: p, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.portfolio);
}

export function getMatchingRequestsForPortfolio(portfolio, requests, options = {}) {
  if (!portfolio || !Array.isArray(requests) || requests.length === 0) {return [];} 

  const tolerance = options.tolerance ?? 0.10; // 10%

  const pCity = portfolio.city || '';
  const pDistrict = portfolio.district || '';
  const pNeighborhood = portfolio.neighborhood || '';
  const pRooms = normalizeRoomCount(portfolio.roomCount || portfolio.rooms);
  const pType = portfolio.propertyType || '';
  const pListing = portfolio.listingStatus || portfolio.listingType || '';
  const pPrice = portfolio.price;
  const pSqm = (portfolio.squareMeters != null ? portfolio.squareMeters : (portfolio.netSquareMeters != null ? portfolio.netSquareMeters : (portfolio.grossSquareMeters != null ? portfolio.grossSquareMeters : portfolio.area)));
  const pAge = portfolio.buildingAge;
  const pFloor = (portfolio.floor != null && portfolio.floor !== '') ? portfolio.floor : portfolio.floorNumber;

  return requests.filter((req) => {
    if (!req) {return false;}
    // City exact
    if (req.city && pCity && !equalsNormalized(req.city, pCity)) {return false;}
    // District exact within set
    const reqDistricts = Array.isArray(req.districts) ? req.districts : (req.district ? [req.district] : []);
    if (reqDistricts.length > 0) {
      if (!pDistrict || !includesNormalized(reqDistricts, pDistrict)) {return false;}
    }
    // Neighborhood exact within set
    const reqNeighborhoods = Array.isArray(req.neighborhoods) ? req.neighborhoods : (req.neighborhood ? [req.neighborhood] : []);
    if (reqNeighborhoods.length > 0) {
      if (!pNeighborhood || !includesNormalized(reqNeighborhoods, pNeighborhood, true)) {return false;}
    }
    // Listing type
    const rListing = normalizeListingStatus(req.listingStatus || req.listingType || '');
    const pListingN = normalizeListingStatus(pListing);
    if (rListing && pListingN && rListing !== pListingN) {return false;}
    // Property type
    const rType = normalizeText(req.propertyType || '');
    const pTypeN = normalizeText(pType || '');
    if (rType && pTypeN && rType !== pTypeN) {return false;}
    // Rooms
    const rRooms = normalizeRoomCount(req.roomCount);
    if (rRooms.length > 0) {
      if (pRooms.length === 0) {return false;}
      const anyMatch = pRooms.some((r) => rRooms.includes(r));
      if (!anyMatch) {return false;}
    }
    // Price tolerance
    if (!withinTolerance(pPrice, req.minPrice, req.maxPrice, tolerance)) {return false;}
    // Sqm tolerance
    if (!withinTolerance(pSqm, req.minSquareMeters, req.maxSquareMeters, tolerance)) {return false;}
    // Age tolerance if provided
    const rMinAge = (req.minBuildingAge !== undefined ? req.minBuildingAge : (Array.isArray(req.buildingAge) ? req.buildingAge[0] : undefined));
    const rMaxAge = (req.maxBuildingAge !== undefined ? req.maxBuildingAge : (Array.isArray(req.buildingAge) ? req.buildingAge[1] : undefined));
    if (rMinAge != null || rMaxAge != null) {
      if (!withinTolerance(pAge, rMinAge, rMaxAge, tolerance)) {return false;}
    }
    // Floor tolerance if provided
    const rMinFloor = (req.minFloor !== undefined ? req.minFloor : (Array.isArray(req.floor) ? req.floor[0] : undefined));
    const rMaxFloor = (req.maxFloor !== undefined ? req.maxFloor : (Array.isArray(req.floor) ? req.floor[1] : undefined));
    if (rMinFloor != null || rMaxFloor != null) {
      if (!withinTolerance(pFloor, rMinFloor, rMaxFloor, tolerance)) {return false;}
    }
    return true;
  });
}


