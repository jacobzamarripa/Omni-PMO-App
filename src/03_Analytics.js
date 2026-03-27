/**
 * FILE: 03_Analytics.gs
 * PURPOSE: Deep historical analysis, timeline generation, and dashboard data prep.
 */

// 🧠 FIX: Added refDict as a parameter so we know the true QuickBase BOMs
function buildBenchmarkDictionary(historicalData, headers, refDict) {
  let getIdx = (name) => headers.indexOf(name);
  
  let fdhIdx = getIdx("FDH Engineering ID");
  let dateIdx = getIdx("Date");
  let locIdx = getIdx("Locates Called In");
  let cabIdx = getIdx("Cabinets Set");
  let lightIdx = getIdx("Light to Cabinets");

  let ugDailyIdx = getIdx("Daily UG Footage");
  let ugTotIdx = getIdx("Total UG Footage Completed");
  let ugBOMIdx = getIdx("UG BOM Quantity");

  let aeDailyIdx = getIdx("Daily Strand Footage");
  let aeTotIdx = getIdx("Total Strand Footage Complete?"); 
  let aeBOMIdx = getIdx("Strand BOM Quantity");

  let fibDailyIdx = getIdx("Daily Fiber Footage");
  let fibTotIdx = getIdx("Total Fiber Footage Complete");
  let fibBOMIdx = getIdx("Fiber BOM Quantity");

  let napDailyIdx = getIdx("Daily NAPs/Encl. Completed");
  let napTotIdx = getIdx("Total NAPs Completed");
  let napBOMIdx = getIdx("NAP/Encl. BOM Qty.");

  let historyByFDH = {};

  for (let i = 1; i < historicalData.length; i++) {
      let row = historicalData[i];
      let fdh = String(row[fdhIdx]).toUpperCase().trim();
      if (!fdh || fdh === "") continue;
      
      if (!historyByFDH[fdh]) historyByFDH[fdh] = [];
      historyByFDH[fdh].push(row);
  }

  let benchmarks = {};

  for (let fdh in historyByFDH) {
      let rows = historyByFDH[fdh];
      rows.sort((a, b) => new Date(a[dateIdx]) - new Date(b[dateIdx]));

      let m = { 
          loc: null, cab: null, light: null,
          ugStart: null, ugEnd: null, ugMaxTot: 0, ugMaxDaily: 0, ugMaxBom: 0,
          aeStart: null, aeEnd: null, aeMaxTot: 0, aeMaxDaily: 0, aeMaxBom: 0,
          fibStart: null, fibEnd: null, fibMaxTot: 0, fibMaxDaily: 0, fibMaxBom: 0,
          napStart: null, napEnd: null, napMaxTot: 0, napMaxDaily: 0, napMaxBom: 0
      };

      // Scan through time to find the "Firsts" and maximums
      rows.forEach(r => {
          let d = r[dateIdx];
          if (!d) return;
          
          let dateObj = (d instanceof Date) ? d : new Date(d);
          if (isNaN(dateObj.getTime())) return;
          let dateStr = Utilities.formatDate(dateObj, "GMT-5", "M/d/yy"); 

          if (!m.loc && r[locIdx] === true) m.loc = dateStr;
          if (!m.cab && r[cabIdx] === true) m.cab = dateStr;
          if (!m.light && r[lightIdx] === true) m.light = dateStr;

          // UG Tracking
          let ugDaily = Number(r[ugDailyIdx]) || 0;
          let ugTot = Number(r[ugTotIdx]) || 0;
          let ugBom = Number(r[ugBOMIdx]) || 0;
          m.ugMaxDaily = Math.max(m.ugMaxDaily, ugDaily);
          m.ugMaxTot = Math.max(m.ugMaxTot, ugTot);
          m.ugMaxBom = Math.max(m.ugMaxBom, ugBom);
          if (!m.ugStart && ugTot > 0) m.ugStart = dateStr;
          if (!m.ugEnd && ugTot > 0 && ugBom > 0 && ugTot >= ugBom) m.ugEnd = dateStr;

          // AE Tracking
          let aeDaily = Number(r[aeDailyIdx]) || 0;
          let aeTot = Number(r[aeTotIdx]) || 0;
          let aeBom = Number(r[aeBOMIdx]) || 0;
          m.aeMaxDaily = Math.max(m.aeMaxDaily, aeDaily);
          m.aeMaxTot = Math.max(m.aeMaxTot, aeTot);
          m.aeMaxBom = Math.max(m.aeMaxBom, aeBom);
          if (!m.aeStart && aeTot > 0) m.aeStart = dateStr;
          if (!m.aeEnd && aeTot > 0 && aeBom > 0 && aeTot >= aeBom) m.aeEnd = dateStr;

          // Fiber Tracking
          let fibDaily = Number(r[fibDailyIdx]) || 0;
          let fibTot = Number(r[fibTotIdx]) || 0;
          let fibBom = Number(r[fibBOMIdx]) || 0;
          m.fibMaxDaily = Math.max(m.fibMaxDaily, fibDaily);
          m.fibMaxTot = Math.max(m.fibMaxTot, fibTot);
          m.fibMaxBom = Math.max(m.fibMaxBom, fibBom);
          if (!m.fibStart && fibTot > 0) m.fibStart = dateStr;
          if (!m.fibEnd && fibTot > 0 && fibBom > 0 && fibTot >= fibBom) m.fibEnd = dateStr;

          // NAP Tracking
          let napDaily = Number(r[napDailyIdx]) || 0;
          let napTot = Number(r[napTotIdx]) || 0;
          let napBom = Number(r[napBOMIdx]) || 0;
          m.napMaxDaily = Math.max(m.napMaxDaily, napDaily);
          m.napMaxTot = Math.max(m.napMaxTot, napTot);
          m.napMaxBom = Math.max(m.napMaxBom, napBom);
          if (!m.napStart && napTot > 0) m.napStart = dateStr;
          if (!m.napEnd && napTot > 0 && napBom > 0 && napTot >= napBom) m.napEnd = dateStr;
      });

      let text = [];
      if (m.loc || m.cab || m.light) {
          text.push(`📍 Loc: ${m.loc||'-'} | Cab: ${m.cab||'-'} | Lit: ${m.light||'-'}\n`);
      }

      // Fetch QuickBase References
      let rData = refDict ? refDict[fdh] : null;
      let rUgBom = rData ? rData.ugBOM : 0;
      let rAeBom = rData ? rData.aeBOM : 0;
      let rFibBom = rData ? rData.fibBOM : 0;
      let rNapBom = rData ? rData.napBOM : 0;

      // 🧠 NEW: Dynamic Formatter
      const formatPhase = (name, start, end, refBom, maxDaily, maxTot, maxVendBom) => {
          let hasActivity = maxDaily > 0 || maxTot > 0 || maxVendBom > 0;
          
          // CONDITION 1: OMIT if BOM is 0 and there is 0 activity
          if (refBom === 0 && !hasActivity) return null; 
          
          // CONDITION 2: REROUTE if BOM is 0 but there IS activity
          let reroute = (refBom === 0 && hasActivity) ? " [Possible Reroute]" : "";
          
          if (!start) return `${name}: Pending${reroute}`;
          if (start && !end) return `${name}: ${start} -> Tracking${reroute}`;
          return `${name}: ${start} -> ${end} (100%)${reroute}`;
      };

      let ugLine = formatPhase("UG", m.ugStart, m.ugEnd, rUgBom, m.ugMaxDaily, m.ugMaxTot, m.ugMaxBom);
      let aeLine = formatPhase("AE", m.aeStart, m.aeEnd, rAeBom, m.aeMaxDaily, m.aeMaxTot, m.aeMaxBom);
      let fibLine = formatPhase("FIB", m.fibStart, m.fibEnd, rFibBom, m.fibMaxDaily, m.fibMaxTot, m.fibMaxBom);
      let napLine = formatPhase("NAP", m.napStart, m.napEnd, rNapBom, m.napMaxDaily, m.napMaxTot, m.napMaxBom);

      if (ugLine) text.push(ugLine);
      if (aeLine) text.push(aeLine);
      if (fibLine) text.push(fibLine);
      if (napLine) text.push(napLine);

      benchmarks[fdh] = text.join("\n");
  }
  
  return benchmarks;
}