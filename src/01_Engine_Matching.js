/**
 * FILE: 01_Engine_Matching.js
 * PURPOSE: Fuzzy matching logic for project ID normalization and deduplication guards
 * SPLIT FROM: 01_Engine.js (WS16 modularization)
 */

// --- 2. LOGIC & MATCHING ---

function attemptFuzzyMatch(badId, officialKeys, optionalCityContext = null, refDict = null) {
  if (!badId) return null;
  let cleanId = badId.toString().toUpperCase().trim();

  // 1. Extract the F-Number
  let fMatch = cleanId.match(/F[- ]*0*(\d+)/);
  if (!fMatch) return null;
  let fNum = fMatch[1]; 

  // 2. Extract Market Prefix
  let mMatch = cleanId.match(/^([A-Z]{3})/);
  let marketPrefix = mMatch ? mMatch[1] : null;

  // 3. Find candidates sharing the exact F-Number
  let candidates = officialKeys.filter(k => {
      let kMatch = k.match(/F[- ]*0*(\d+)$/);
      return kMatch && kMatch[1] === fNum;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 4. Triangulate with Market Prefix
  if (marketPrefix) {
      let marketCandidates = candidates.filter(k => k.startsWith(marketPrefix));
      if (marketCandidates.length === 1) return marketCandidates[0];
      if (marketCandidates.length > 1) candidates = marketCandidates; 
  }

  // 5. Triangulate with City Context (Saves "F-23" based on Sheet Tab Name)
  if (optionalCityContext && refDict) {
      let safeContext = optionalCityContext.toUpperCase().replace(/[^A-Z]/g, '');
      let cityCandidates = candidates.filter(k => {
          let city = (refDict[k] && refDict[k].city) ? refDict[k].city.toUpperCase().replace(/[^A-Z]/g, '') : "";
          return city && (safeContext.includes(city) || city.includes(safeContext));
      });
      if (cityCandidates.length === 1) return cityCandidates[0];
  }

  return null;
}

