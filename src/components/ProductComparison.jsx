import React, { useState, useMemo, useRef, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export default function ProductComparison({ apiBase, onScrapeMissing }) {
  const [targetSection, setTargetSection] = useState("all"); // "all" | "medicine" | "blinkit" | "otc"
  const [dbCatalog, setDbCatalog] = useState([]);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbLoadedSection, setDbLoadedSection] = useState(null);

  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedFileSize, setUploadedFileSize] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [processingStatusText, setProcessingStatusText] = useState("");
  const [rawMasterRows, setRawMasterRows] = useState([]);
  const [comparisonResults, setComparisonResults] = useState([]);

  // Pagination states (prevents UI freezing on large datasets)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "perfect" | "discrepancy" | "missing"
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  const fileInputRef = useRef(null);

  // Pre-load DB catalog on mount
  useEffect(() => {
    fetchDbCatalog("all");
  }, []);

  // Fetch lightweight database catalog for comparison
  const fetchDbCatalog = async (section) => {
    setIsLoadingDb(true);
    try {
      const res = await fetch(`${apiBase}/products/all-for-compare?section=${section}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setDbCatalog(data.data);
          setDbLoadedSection(section);
          return data.data;
        }
      }
    } catch (err) {
      console.warn("Failed to load DB products for compare:", err);
    } finally {
      setIsLoadingDb(false);
    }
    return [];
  };

  // Helper to normalize strings for matching
  const normalize = (str) =>
    String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // HIGH-PERFORMANCE ASYNC CHUNKED COMPARISON ENGINE (Will NEVER freeze or hang the browser)
  const runComparisonAsync = (masterRows, catalog) => {
    if (!Array.isArray(masterRows) || masterRows.length === 0) {
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    setParseProgress(5);
    setProcessingStatusText("Indexing database products for high-speed matching...");

    // 1. Build ultra-fast O(1) indexed hash maps & inverted token index
    const idMap = new Map();
    const nameMap = new Map();
    const invertedTokenIndex = new Map(); // token -> Set of candidate items

    catalog.forEach((item) => {
      // Index by ID
      if (item.product_id) {
        idMap.set(String(item.product_id).toLowerCase().trim(), item);
      }
      // Index by Normalized Name
      const normName = normalize(item.product_name);
      if (normName) {
        if (!nameMap.has(normName)) nameMap.set(normName, item);

        // Inverted Index: index tokens of length >= 3
        const tokens = normName.split(" ").filter((t) => t.length >= 3);
        tokens.forEach((t) => {
          if (!invertedTokenIndex.has(t)) invertedTokenIndex.set(t, []);
          invertedTokenIndex.get(t).push({ item, normName, tokens });
        });
      }
    });

    const totalRows = masterRows.length;
    const CHUNK_SIZE = 500; // Process 500 rows per tick to keep browser UI at 60 FPS
    let currentIndex = 0;
    const allResults = [];

    const processNextChunk = () => {
      const chunkEnd = Math.min(currentIndex + CHUNK_SIZE, totalRows);

      for (let idx = currentIndex; idx < chunkEnd; idx++) {
        const row = masterRows[idx];

        // Auto-detect columns from Master row flexibly
        const masterPid = String(
          row["Product ID"] || row["productId"] || row["Item Code"] || row["SKU"] || row["Barcode"] || row["Code"] || row["ID"] || ""
        ).trim();

        const masterName = String(
          row["Product Name"] || row["product_name"] || row["Item Name"] || row["Name"] || row["Title"] || row["Description"] || ""
        ).trim();

        if (!masterName && !masterPid) continue; // Skip completely empty rows

        const masterBrand = String(row["Brand"] || row["brand"] || row["Company"] || row["Manufacturer"] || "").trim();
        const masterSalt = String(row["Generic Salt"] || row["generic_salt"] || row["Composition"] || row["Salt"] || "").trim();
        const masterUnit = String(row["Unit"] || row["unit"] || row["Pack Size"] || row["Packaging"] || "").trim();

        const masterMrp = parseFloat(String(row["MRP"] || row["mrp"] || row["Price"] || row["Retail Price"] || "0").replace(/[^0-9.]/g, "")) || 0;
        const masterSp = parseFloat(String(row["Selling Price"] || row["selling_price"] || row["Rate"] || row["SP"] || masterMrp || "0").replace(/[^0-9.]/g, "")) || masterMrp;

        let matchedDbItem = null;
        let matchMethod = "none";

        // Step A: Instant O(1) ID match
        if (masterPid && idMap.has(masterPid.toLowerCase())) {
          matchedDbItem = idMap.get(masterPid.toLowerCase());
          matchMethod = "id_exact";
        }

        // Step B: Instant O(1) Exact Name match
        if (!matchedDbItem && masterName) {
          const norm = normalize(masterName);
          if (nameMap.has(norm)) {
            matchedDbItem = nameMap.get(norm);
            matchMethod = "name_exact";
          }
        }

        // Step C: Ultra-fast Inverted Index Token Matching
        if (!matchedDbItem && masterName) {
          const norm = normalize(masterName);
          const rowTokens = norm.split(" ").filter((t) => t.length >= 3);

          if (rowTokens.length > 0) {
            // Collect only candidates that share at least 1 token
            const candidateMap = new Map();
            for (const t of rowTokens) {
              const matches = invertedTokenIndex.get(t);
              if (matches) {
                for (const m of matches) {
                  candidateMap.set(m.item.product_id, m);
                }
              }
            }

            // Score only the relevant candidates (typically 2-10 items instead of 5,000)
            let bestScore = 0;
            let bestItem = null;

            candidateMap.forEach((cand) => {
              let matchCount = 0;
              for (const t of rowTokens) {
                if (cand.tokens.includes(t)) matchCount++;
              }
              const score = matchCount / Math.max(rowTokens.length, cand.tokens.length);
              if (score > bestScore && score >= 0.5) {
                bestScore = score;
                bestItem = cand.item;
              }
            });

            if (bestItem) {
              matchedDbItem = bestItem;
              matchMethod = "fuzzy_token";
            }
          }
        }

        // Step D: Calculate Reconciliation Status & Differences
        if (matchedDbItem) {
          const dbMrp = parseFloat(matchedDbItem.mrp) || 0;
          const dbSp = parseFloat(matchedDbItem.selling_price) || 0;

          const mrpDiff = Number((masterMrp - dbMrp).toFixed(2));
          const spDiff = Number((masterSp - dbSp).toFixed(2));

          const hasPriceDiscrepancy = Math.abs(mrpDiff) > 0.5 || Math.abs(spDiff) > 0.5;

          allResults.push({
            rowId: idx + 1,
            status: hasPriceDiscrepancy ? "price_discrepancy" : "perfect_match",
            matchMethod,
            master: {
              pid: masterPid || "N/A",
              name: masterName,
              brand: masterBrand,
              salt: masterSalt,
              unit: masterUnit,
              mrp: masterMrp,
              sp: masterSp,
            },
            db: {
              pid: matchedDbItem.product_id,
              name: matchedDbItem.product_name,
              brand: matchedDbItem.brand,
              salt: matchedDbItem.generic_salt || matchedDbItem.composition,
              unit: matchedDbItem.unit,
              mrp: dbMrp,
              sp: dbSp,
              section: matchedDbItem.section,
              url: matchedDbItem.product_url,
            },
            diff: {
              mrpDiff,
              spDiff,
              mrpVariancePct: dbMrp > 0 ? Number(((mrpDiff / dbMrp) * 100).toFixed(1)) : 0,
              spVariancePct: dbSp > 0 ? Number(((spDiff / dbSp) * 100).toFixed(1)) : 0,
            },
          });
        } else {
          // Missing in DB
          allResults.push({
            rowId: idx + 1,
            status: "missing_in_db",
            matchMethod: "none",
            master: {
              pid: masterPid || "N/A",
              name: masterName,
              brand: masterBrand,
              salt: masterSalt,
              unit: masterUnit,
              mrp: masterMrp,
              sp: masterSp,
            },
            db: null,
            diff: null,
          });
        }
      }

      currentIndex = chunkEnd;
      const pct = Math.round((currentIndex / totalRows) * 100);
      setParseProgress(pct);
      setProcessingStatusText(`Reconciling: ${currentIndex.toLocaleString("en-IN")} of ${totalRows.toLocaleString("en-IN")} records (${pct}%)...`);

      if (currentIndex < totalRows) {
        // Yield execution to browser event loop to keep UI smooth and responsive
        setTimeout(processNextChunk, 0);
      } else {
        // Complete
        setComparisonResults(allResults);
        setIsProcessing(false);
        setCurrentPage(1);
        setToastMessage(`✅ Reconciliation Complete! ${allResults.length.toLocaleString("en-IN")} Master SKUs analyzed smoothly.`);
        setTimeout(() => setToastMessage(""), 5000);
      }
    };

    // Kickoff chunked processing
    setTimeout(processNextChunk, 10);
  };

  // Handle Master File Upload (CSV, XLSX, XLS)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setUploadedFileSize(file.size);
    setIsProcessing(true);
    setParseProgress(10);
    setProcessingStatusText("Reading file data into memory...");

    // 1. Ensure DB catalog is loaded
    let catalog = dbCatalog;
    if (catalog.length === 0 || dbLoadedSection !== targetSection) {
      setProcessingStatusText("Loading latest catalog from Hostinger MySQL...");
      catalog = await fetchDbCatalog(targetSection);
    }

    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: "binary" });
          const firstSheetName = wb.SheetNames[0];
          const ws = wb.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(ws, { defval: "" });
          setRawMasterRows(jsonData);
          runComparisonAsync(jsonData, catalog);
        } catch (err) {
          alert("Error parsing Excel file: " + err.message);
          setIsProcessing(false);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      // CSV Parsing via PapaParse
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (res) => {
          setRawMasterRows(res.data);
          runComparisonAsync(res.data, catalog);
        },
        error: (err) => {
          alert("Error parsing CSV file: " + err.message);
          setIsProcessing(false);
        },
      });
    }
  };

  // Download Sample Template for Testing
  const handleDownloadSampleTemplate = () => {
    const sampleHeaders = [
      "Product ID", "Product Name", "Brand", "MRP", "Selling Price",
      "Generic Salt", "Unit", "Category"
    ];
    const sampleRows = [
      ["MED-101", "Dolo 650 Tablet", "Micro Labs Ltd", "32.28", "29.70", "Paracetamol", "15 Tablets", "Pain & Fever"],
      ["MED-102", "Zifi 200 Tablet", "FDC Ltd", "105.11", "97.10", "Cefixime", "10 Tablets", "Antibiotics"],
      ["MED-103", "Augmentin 625 Duo Tablet", "GlaxoSmithKline", "223.00", "201.00", "Amoxycillin and Potassium Clavulanate", "10 Tablets", "Antibiotics"],
      ["OTC-201", "Volini Pain Relief Gel 75g", "Sun Pharma", "145.00", "130.00", "Diclofenac Diethylamine", "75 gm Tube", "Pain Relief"],
      ["OTC-202", "Vicks Vaporub 50g", "Procter & Gamble", "165.00", "155.00", "Menthol, Camphor", "50 gm Jar", "Cough & Cold"],
      ["BK-301", "Amul Butter 500g", "Amul", "275.00", "265.00", "Pasteurized Butter", "500 gm Pack", "Dairy"],
      ["BK-302", "Cadbury Dairy Milk Silk Chocolate", "Mondelez", "105.00", "95.00", "Milk Chocolate", "60 gm Bar", "Chocolates"],
      ["NEW-999", "Rare Ayurvedic Immunity Rasayan 500g", "Rare Brand", "650.00", "590.00", "Ayurvedic Herbs", "500 gm", "Immunity"],
    ];

    const csvContent = "\uFEFF" + [sampleHeaders.join(","), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ZepMed_Sample_Master_Template_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download Full Reconciliation Discrepancy Report CSV
  const handleDownloadComparisonReport = () => {
    if (comparisonResults.length === 0) {
      alert("No comparison results to export.");
      return;
    }

    const headers = [
      "Row #", "Reconciliation Status", "Master Product ID", "Master Product Name",
      "Master Brand", "Master MRP", "Master Selling Price", "Master Salt",
      "DB Matched ID", "DB Matched Name", "DB Brand", "DB MRP", "DB Selling Price",
      "MRP Difference (₹)", "Selling Price Diff (₹)", "MRP Variance %", "DB Section",
      "DB Live Store URL"
    ];

    const clean = (val) => `"${String(val || "").replace(/"/g, '""').replace(/\r?\n|\r/g, " ")}"`;

    const rows = comparisonResults.map((r) => [
      r.rowId,
      clean(r.status === "perfect_match" ? "PERFECT MATCH" : r.status === "price_discrepancy" ? "PRICE DISCREPANCY" : "MISSING IN DATABASE"),
      clean(r.master.pid),
      clean(r.master.name),
      clean(r.master.brand),
      r.master.mrp.toFixed(2),
      r.master.sp.toFixed(2),
      clean(r.master.salt),
      clean(r.db ? r.db.pid : "N/A"),
      clean(r.db ? r.db.name : "N/A"),
      clean(r.db ? r.db.brand : "N/A"),
      r.db ? r.db.mrp.toFixed(2) : "0.00",
      r.db ? r.db.sp.toFixed(2) : "0.00",
      r.diff ? r.diff.mrpDiff.toFixed(2) : "N/A",
      r.diff ? r.diff.spDiff.toFixed(2) : "N/A",
      r.diff ? `${r.diff.mrpVariancePct}%` : "N/A",
      clean(r.db ? r.db.section.toUpperCase() : "N/A"),
      clean(r.db ? r.db.url : "N/A"),
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ZepMed_Master_Reconciliation_Report_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = comparisonResults.length;
    if (total === 0) return null;

    let perfect = 0;
    let discrepancy = 0;
    let missing = 0;
    let masterTotalValuation = 0;
    let dbTotalValuation = 0;

    comparisonResults.forEach((r) => {
      masterTotalValuation += r.master.mrp;
      if (r.status === "perfect_match") perfect++;
      else if (r.status === "price_discrepancy") discrepancy++;
      else if (r.status === "missing_in_db") missing++;

      if (r.db) dbTotalValuation += r.db.mrp;
    });

    const matchRate = total > 0 ? Math.round(((perfect + discrepancy) / total) * 100) : 0;

    return {
      total,
      perfect,
      discrepancy,
      missing,
      matchRate,
      masterTotalValuation,
      dbTotalValuation,
      valuationDiff: Number((masterTotalValuation - dbTotalValuation).toFixed(2)),
    };
  }, [comparisonResults]);

  // Filtered Results for the Table
  const filteredList = useMemo(() => {
    let list = comparisonResults;

    if (activeFilter === "perfect") {
      list = list.filter((r) => r.status === "perfect_match");
    } else if (activeFilter === "discrepancy") {
      list = list.filter((r) => r.status === "price_discrepancy");
    } else if (activeFilter === "missing") {
      list = list.filter((r) => r.status === "missing_in_db");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const m = r.master;
        const d = r.db;
        const blob = `${m.name} ${m.brand} ${m.salt} ${m.pid} ${d?.name || ""} ${d?.brand || ""}`.toLowerCase();
        return blob.includes(q);
      });
    }

    return list;
  }, [comparisonResults, activeFilter, searchQuery]);

  // Paginated Slice (Protects the DOM from crashing on large 1,00,000+ row datasets)
  const totalPages = Math.ceil(filteredList.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  return (
    <div className="product-comparison-container">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="toast-banner">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage("")} style={{ background: "transparent", border: "none", color: "white", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Header Banner */}
      <div className="compare-header-box">
        <div className="compare-title-wrap">
          <div className="compare-tag">⚡ ADVANCED MASTER RECONCILIATION ENGINE</div>
          <h2>⚖️ Compare Products: Master CSV / Excel vs Live Database</h2>
          <p>
            तुमची Master CSV किंवा Excel फाईल (१०० ते १,००,०००+ प्रॉडक्ट्स) थेट Hostinger MySQL डेटाबेससोबत (Medicine, Blinkit, OTC) रिअल-टाईम कंपेअर करा. 
            प्रॉडक्ट मॅचिंग, किमतीतील फरक (MRP / Selling Price Discrepancies), आणि डेटाबेसमध्ये नसलेले प्रॉडक्ट्स (Missing in DB) एका क्लिकवर तपासा.
          </p>
        </div>

        <div className="compare-top-actions">
          <button
            type="button"
            className="sample-download-btn"
            onClick={handleDownloadSampleTemplate}
            title="Download formatted sample template CSV"
          >
            📄 Sample Master Template (.csv)
          </button>
          {comparisonResults.length > 0 && (
            <button
              type="button"
              className="export-report-btn"
              onClick={handleDownloadComparisonReport}
              title="Download detailed discrepancy and reconciliation report"
            >
              📥 Download Comparison Report (.csv)
            </button>
          )}
        </div>
      </div>

      {/* Upload Zone & Config Card */}
      <div className="compare-upload-card">
        <div className="upload-controls-row">
          <div className="compare-select-group">
            <label>🎯 Compare Against DB Section:</label>
            <select
              className="compare-dropdown"
              value={targetSection}
              onChange={(e) => {
                setTargetSection(e.target.value);
                if (rawMasterRows.length > 0) {
                  fetchDbCatalog(e.target.value).then((cat) => runComparisonAsync(rawMasterRows, cat));
                }
              }}
            >
              <option value="all">🔥 All Databases (Medicine + Blinkit + OTC Combined)</option>
              <option value="medicine">💊 Tata 1mg Medicine Database (zepmed_medicines)</option>
              <option value="blinkit">⚡ Blinkit Grocery Database (zepmed_blinkit_products)</option>
              <option value="otc">🌿 Tata 1mg OTC Database (zepmed_otc_medicines)</option>
            </select>
          </div>

          <div className="file-drop-area" onClick={() => fileInputRef.current?.click()}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
            />
            <div className="drop-icon">📁</div>
            <div className="drop-text-content">
              <strong>{uploadedFileName || "Upload Master Catalog CSV or Excel File"}</strong>
              <span>
                {uploadedFileName
                  ? `File Size: ${(uploadedFileSize / (1024 * 1024)).toFixed(2)} MB • Click to change file`
                  : "Supports .csv, .xlsx, .xls • Fast async streaming for 1,00,000+ rows (Zero Lag)"}
              </span>
            </div>
            <button type="button" className="browse-file-btn">
              Browse File 📂
            </button>
          </div>
        </div>

        {/* Live Processing Indicator */}
        {isProcessing && (
          <div className="parse-progress-bar-wrap">
            <div className="progress-labels">
              <span>⚡ {processingStatusText || "Processing & Matching Products with Hostinger MySQL..."}</span>
              <span>{parseProgress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${parseProgress}%` }}></div>
            </div>
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      {metrics && (
        <div className="compare-kpi-grid">
          <div className="compare-kpi-card">
            <div className="kpi-num">{metrics.total.toLocaleString("en-IN")}</div>
            <div className="kpi-label">Total Master SKUs Analyzed</div>
            <div className="kpi-sub">Uploaded File Records</div>
          </div>

          <div className="compare-kpi-card success">
            <div className="kpi-num">{metrics.perfect.toLocaleString("en-IN")}</div>
            <div className="kpi-label">🟢 Exact Spec & Price Matches</div>
            <div className="kpi-sub">{Math.round((metrics.perfect / metrics.total) * 100)}% 100% Matching</div>
          </div>

          <div className="compare-kpi-card warning">
            <div className="kpi-num">{metrics.discrepancy.toLocaleString("en-IN")}</div>
            <div className="kpi-label">🟡 Price / Margin Discrepancies</div>
            <div className="kpi-sub">{Math.round((metrics.discrepancy / metrics.total) * 100)}% Rate Variances</div>
          </div>

          <div className="compare-kpi-card danger">
            <div className="kpi-num">{metrics.missing.toLocaleString("en-IN")}</div>
            <div className="kpi-label">🔴 Missing in Database</div>
            <div className="kpi-sub">{Math.round((metrics.missing / metrics.total) * 100)}% Ready to Scrape/Add</div>
          </div>
        </div>
      )}

      {/* Table & Reconciliation Filter Controls */}
      {comparisonResults.length > 0 && (
        <div className="compare-results-card">
          <div className="results-toolbar">
            <div className="filter-chips-row">
              <button
                type="button"
                className={`compare-chip ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => { setActiveFilter("all"); setCurrentPage(1); }}
              >
                🔥 All Records ({comparisonResults.length.toLocaleString("en-IN")})
              </button>
              <button
                type="button"
                className={`compare-chip success ${activeFilter === "perfect" ? "active" : ""}`}
                onClick={() => { setActiveFilter("perfect"); setCurrentPage(1); }}
              >
                🟢 Exact Match ({metrics?.perfect.toLocaleString("en-IN")})
              </button>
              <button
                type="button"
                className={`compare-chip warning ${activeFilter === "discrepancy" ? "active" : ""}`}
                onClick={() => { setActiveFilter("discrepancy"); setCurrentPage(1); }}
              >
                🟡 Price Discrepancies ({metrics?.discrepancy.toLocaleString("en-IN")})
              </button>
              <button
                type="button"
                className={`compare-chip danger ${activeFilter === "missing" ? "active" : ""}`}
                onClick={() => { setActiveFilter("missing"); setCurrentPage(1); }}
              >
                🔴 Missing in DB ({metrics?.missing.toLocaleString("en-IN")})
              </button>
            </div>

            <div className="compare-search-wrap">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search by Product Name, Brand, Salt, ID..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="compare-search-input"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(""); setCurrentPage(1); }} className="clear-btn">✕</button>
              )}
            </div>
          </div>

          {/* Reconciliation Table */}
          <div className="compare-table-wrapper">
            <table className="compare-table">
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>#</th>
                  <th style={{ width: "130px" }}>Status</th>
                  <th style={{ width: "32%" }}>Master File Product Details</th>
                  <th style={{ width: "32%" }}>Database Matched Product</th>
                  <th style={{ width: "130px" }}>MRP Comparison</th>
                  <th style={{ width: "140px" }}>Selling Price Comp</th>
                  <th style={{ width: "110px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-compare-cell">
                      🔍 No products found matching current filter or search criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((row) => {
                    const isPerfect = row.status === "perfect_match";
                    const isDiscrepancy = row.status === "price_discrepancy";
                    const isMissing = row.status === "missing_in_db";

                    return (
                      <tr key={row.rowId} className={`compare-row ${row.status}`}>
                        <td className="row-num">{row.rowId}</td>

                        {/* Status Badge */}
                        <td>
                          {isPerfect && <span className="status-badge-pill green">🟢 Match</span>}
                          {isDiscrepancy && <span className="status-badge-pill orange">🟡 Price Diff</span>}
                          {isMissing && <span className="status-badge-pill red">🔴 Missing</span>}
                        </td>

                        {/* Master File Details */}
                        <td>
                          <div className="prod-title-lead">{row.master.name}</div>
                          <div className="prod-meta-tags">
                            {row.master.brand && <span className="meta-pill">Brand: {row.master.brand}</span>}
                            {row.master.pid && <span className="meta-pill mono">ID: {row.master.pid}</span>}
                            {row.master.salt && <span className="meta-pill">Salt: {row.master.salt}</span>}
                            {row.master.unit && <span className="meta-pill">Pack: {row.master.unit}</span>}
                          </div>
                        </td>

                        {/* Database Matched Product */}
                        <td>
                          {row.db ? (
                            <div>
                              <div className="prod-title-lead db-name">
                                {row.db.name}
                                {row.db.section && (
                                  <span className={`db-section-tag ${row.db.section}`}>
                                    {row.db.section.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="prod-meta-tags">
                                <span className="meta-pill">DB Brand: {row.db.brand || "N/A"}</span>
                                {row.db.salt && <span className="meta-pill">DB Salt: {row.db.salt}</span>}
                                {row.db.url && (
                                  <a href={row.db.url} target="_blank" rel="noopener noreferrer" className="db-live-link">
                                    🔗 Open Live Store ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="not-found-text">❌ Not Found in Database</span>
                          )}
                        </td>

                        {/* MRP Comparison */}
                        <td>
                          <div className="price-compare-cell">
                            <div>Master: <strong>₹{row.master.mrp.toFixed(2)}</strong></div>
                            <div>DB: <strong>{row.db ? `₹${row.db.mrp.toFixed(2)}` : "N/A"}</strong></div>
                            {row.diff && Math.abs(row.diff.mrpDiff) > 0.01 && (
                              <div className={`diff-pill ${row.diff.mrpDiff > 0 ? "higher" : "lower"}`}>
                                {row.diff.mrpDiff > 0 ? `+₹${row.diff.mrpDiff}` : `-₹${Math.abs(row.diff.mrpDiff)}`} ({row.diff.mrpVariancePct}%)
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Selling Price Comparison */}
                        <td>
                          <div className="price-compare-cell">
                            <div>Master: <strong>₹{row.master.sp.toFixed(2)}</strong></div>
                            <div>DB: <strong style={{ color: "#059669" }}>{row.db ? `₹${row.db.sp.toFixed(2)}` : "N/A"}</strong></div>
                            {row.diff && Math.abs(row.diff.spDiff) > 0.01 && (
                              <div className={`diff-pill ${row.diff.spDiff > 0 ? "higher" : "lower"}`}>
                                {row.diff.spDiff > 0 ? `+₹${row.diff.spDiff}` : `-₹${Math.abs(row.diff.spDiff)}`} ({row.diff.spVariancePct}%)
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Action */}
                        <td style={{ textAlign: "center" }}>
                          {isMissing && onScrapeMissing ? (
                            <button
                              type="button"
                              className="quick-scrape-btn"
                              onClick={() => onScrapeMissing(row.master.name)}
                              title="Search & scrape this missing product live into Database"
                            >
                              ⚡ Scrape Live
                            </button>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Synced ✓</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Bar */}
          {filteredList.length > 0 && (
            <div className="pagination-bar">
              <div className="pagination-info">
                Showing <strong>{((currentPage - 1) * pageSize) + 1}</strong> to <strong>{Math.min(currentPage * pageSize, filteredList.length)}</strong> of <strong>{filteredList.length.toLocaleString("en-IN")}</strong> items
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  className="page-size-select"
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={200}>200 per page</option>
                </select>
              </div>

              <div className="pagination-btns">
                <button
                  type="button"
                  className="page-nav-btn"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  ⏮ First
                </button>
                <button
                  type="button"
                  className="page-nav-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ◀ Prev
                </button>
                <span className="page-cur-indicator">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </span>
                <button
                  type="button"
                  className="page-nav-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next ▶
                </button>
                <button
                  type="button"
                  className="page-nav-btn"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last ⏭
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
