import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import { INITIAL_MEDICINES } from "./services/medicineCatalog";
import { INITIAL_BLINKIT_PRODUCTS } from "./services/blinkitCatalog";
import { INITIAL_OTC_PRODUCTS } from "./services/otcCatalog";
import ProductComparison from "./components/ProductComparison";

// Automatic Smart API BASE: Uses /api on Vercel/Production and http://localhost:5000/api in local dev
const API_BASE =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? "/api"
    : "http://localhost:5000/api");

const EXACT_28_COLUMNS = [
  "Product ID", "Product Name", "Product URL", "Image", "Image Status", "Category ID",
  "Category", "Sub Category", "Brand", "MRP", "Selling Price",
  "Discount %", "Allow Discount", "Unit", "Units Per Pack", "Packs Per Box",
  "Composition", "Generic Salt", "Manufacturer", "Description", "Uses",
  "Side Effects", "Dosage", "Health Tags", "Prescription Required",
  "Customer Visible", "Active", "Approval Status", "Image URL"
];

const MEDICINE_CATEGORIES = [
  { label: "🔥 All Medicines (28-Cols)", query: "all" },
  { label: "💊 Antibiotics", query: "zifi cefixime augmentin azithral" },
  { label: "🌡️ Pain & Fever", query: "dolo paracetamol crocin combiflam" },
  { label: "🫀 Acidity & Gastro", query: "pan omez pantocid" },
  { label: "🌿 Vitamins & Calcium", query: "shelcal becosules limcee" },
  { label: "🩺 BP & Diabetes", query: "telma glycomet" },
];

const BLINKIT_CATEGORIES = [
  { label: "🔥 All Blinkit Groceries (28-Cols)", query: "all" },
  { label: "🥛 Dairy & Milk", query: "milk butter paneer" },
  { label: "🌾 Atta & Staples", query: "atta oil salt" },
  { label: "🍪 Snacks & Biscuits", query: "parle biscuit chips" },
  { label: "🍜 Instant Food", query: "maggi noodle" },
  { label: "🍫 Chocolates & Sweets", query: "dairy milk chocolate" },
];

const OTC_CATEGORIES = [
  { label: "🔥 All OTC Products (28-Cols)", query: "all" },
  { label: "🌿 Pain Relief & Balms", query: "volini moov iodex balm" },
  { label: "💪 Immunity & Chyawanprash", query: "chyawanprash revital zandu dabur" },
  { label: "💊 Daily Health & Vitamins", query: "limcee becosules zincovit supradyn" },
  { label: "☕ Cough, Cold & Lozenges", query: "vicks strepsils koflet honitus" },
  { label: "🩺 Digestion & Antacids", query: "digene eno pudin hara gas-o-fast" },
  { label: "🩹 First Aid & Antiseptic", query: "dettol savlon boroline soframycin" },
];

function App() {
  // Navigation: "medicine" | "blinkit" | "otc" | "analysis"
  const [activeSection, setActiveSection] = useState("medicine");

  // Analysis Sub-Tabs: "overview" | "compare"
  const [analysisSubTab, setAnalysisSubTab] = useState("overview");

  // Admin Login for Product Analysis
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("zepmed_admin_logged") === "true";
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("DB@Zepmed.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Permanent Deletion Tracking (IDs blacklisted so they never display again)
  const [deletedProductIds, setDeletedProductIds] = useState(() => {
    try {
      const saved = localStorage.getItem("zepmed_deleted_product_ids");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Product Lists (Excludes any permanently deleted products)
  const [medicineList, setMedicineList] = useState(() => {
    try {
      const saved = localStorage.getItem("zepmed_deleted_product_ids");
      const delSet = saved ? new Set(JSON.parse(saved)) : new Set();
      return INITIAL_MEDICINES.filter((p) => !delSet.has(p.product_id));
    } catch {
      return INITIAL_MEDICINES;
    }
  });
  const [blinkitList, setBlinkitList] = useState(() => {
    try {
      const saved = localStorage.getItem("zepmed_deleted_product_ids");
      const delSet = saved ? new Set(JSON.parse(saved)) : new Set();
      return INITIAL_BLINKIT_PRODUCTS.filter((p) => !delSet.has(p.product_id));
    } catch {
      return INITIAL_BLINKIT_PRODUCTS;
    }
  });
  const [otcList, setOtcList] = useState(() => {
    try {
      const saved = localStorage.getItem("zepmed_deleted_product_ids");
      const delSet = saved ? new Set(JSON.parse(saved)) : new Set();
      return INITIAL_OTC_PRODUCTS.filter((p) => !delSet.has(p.product_id));
    } catch {
      return INITIAL_OTC_PRODUCTS;
    }
  });

  // Database tracking (Set of product_ids stored in Hostinger MySQL)
  const [storedMedicineIds, setStoredMedicineIds] = useState(() => new Set());
  const [storedBlinkitIds, setStoredBlinkitIds] = useState(() => new Set());
  const [storedOtcIds, setStoredOtcIds] = useState(() => new Set());
  const [hideStoredInDb, setHideStoredInDb] = useState(false);
  const [dbStatus, setDbStatus] = useState({ connected: false, host: "82.25.121.184" });

  // Apify Live USD Usage & Credit Tracker
  const [apifyUsage, setApifyUsage] = useState({
    totalCreditsUsd: 5.00,
    usedCreditsUsd: 2.57,
    remainingCreditsUsd: 2.43,
    usagePercent: 51.3,
    plan: "FREE",
    isExhausted: false,
  });

  // Continuous Auto-Generator
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);
  const generatorRunningRef = useRef(false);

  // A-Z Indian Medicines Dataset Batch Auto-Generator (Checkpoint & Circular Progress)
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const batchGeneratorRunningRef = useRef(false);
  const [batchStatus, setBatchStatus] = useState({
    currentRowIndex: 0,
    currentBatchIndex: 0,
    totalRows: 253973,
    totalBatches: 16932,
    percentCompleted: 0,
    batchSize: 15,
    totalProcessed: 0,
    lastMedicineName: "",
    lastBatchMeds: [],
    lastSpeedMs: 0,
    totalInDb: 0,
  });
  const [showBatchDashboard, setShowBatchDashboard] = useState(true);

  // Blinkit 27,555 Products Batch Auto-Generator (Dedicated Checkpoint & Circular Progress)
  const [isBlinkitBatchGenerating, setIsBlinkitBatchGenerating] = useState(false);
  const blinkitBatchRunningRef = useRef(false);
  const [blinkitBatchStatus, setBlinkitBatchStatus] = useState({
    currentRowIndex: 0,
    currentBatchIndex: 0,
    totalRows: 27555,
    totalBatches: 2756,
    percentCompleted: 0,
    batchSize: 10,
    totalProcessed: 0,
    lastProductName: "",
    lastSpeedMs: 0,
    totalInDb: 0,
  });
  const [showBlinkitBatchDashboard, setShowBlinkitBatchDashboard] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("🔥 All Medicines (28-Cols)");
  const [viewMode, setViewMode] = useState("cards"); // "cards" | "table"
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [copiedKey, setCopiedKey] = useState(null);

  // Pagination State (50 items per page for ultra-fast 60 FPS rendering)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Live Apify Scraping & Category Export States
  const [isScrapingLive, setIsScrapingLive] = useState(false);
  const [exportSection, setExportSection] = useState("medicine");
  const [exportCategory, setExportCategory] = useState("all");
  const [exportSubCategory, setExportSubCategory] = useState("all");
  const [downloadedProductIds, setDownloadedProductIds] = useState(() => new Set());

  // Product Analysis Scroll Box Section Selection, Category, Subcategory & Search
  const [analysisActiveSection, setAnalysisActiveSection] = useState("medicine"); // "medicine" | "blinkit" | "otc"
  const [analysisSelectedCategory, setAnalysisSelectedCategory] = useState("all");
  const [analysisSelectedSubCategory, setAnalysisSelectedSubCategory] = useState("all");
  const [analysisSearchQuery, setAnalysisSearchQuery] = useState("");

  // 🌐 Global Full-Database Search State (Hostinger MySQL 20,872+ items)
  const [globalSearchResults, setGlobalSearchResults] = useState(null);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);
  const [globalSearchMeta, setGlobalSearchMeta] = useState({ query: "", totalFound: 0, count: 0, section: "medicine" });

  // 🔬 ScraperAPI Medicine Refill Engine State (Direct 1mg -> Hostinger MySQL)
  const [scraperStatus, setScraperStatus] = useState({
    isRunning: false,
    checkpoint: { lastProcessedId: 0, totalProcessed: 0, totalEnriched: 0, totalFallback: 0, apiKey: "98e1aac9815e67bcf19985e7d1f8b9d5", delayMs: 1000 },
    stats: { totalMedicines: 15188, totalProcessed: 0, totalEnriched: 0, totalFallback: 0, pendingRefill: 12676, percentCompleted: 0 },
    recentEnriched: []
  });
  const [scraperApiKey, setScraperApiKey] = useState("direct_free_mode");
  const [scraperDelay, setScraperDelay] = useState(1500);
  const isDelayUserModified = useRef(false);
  const [isScraperActionLoading, setIsScraperActionLoading] = useState(false);

  useEffect(() => {
    checkDbStatus();
    loadDeletedIds();
    fetchApifyUsage();
    fetchStoredProductIds();
    loadProductsFromDb();
    fetchDatasetStatus();
    fetchBlinkitBatchStatus();
    fetchScraperStatus();
  }, []);

  useEffect(() => {
    let interval = null;
    if (activeSection === "scraper" || scraperStatus.isRunning) {
      fetchScraperStatus();
      interval = setInterval(fetchScraperStatus, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeSection, scraperStatus.isRunning]);

  const mapDbProduct = (p) => ({
    ...p,
    mrp: parseFloat(p.mrp) || 0,
    selling_price: parseFloat(p.selling_price) || 0,
    discount_pct: p.discount_pct || (p.discount_percent ? `${p.discount_percent}%` : "0%"),
  });

  const loadProductsFromDb = async () => {
    try {
      const [medRes, bkRes, otcRes] = await Promise.all([
        fetch(`${API_BASE}/medicines`),
        fetch(`${API_BASE}/blinkit`),
        fetch(`${API_BASE}/otc`),
      ]);

      const delSaved = localStorage.getItem("zepmed_deleted_product_ids");
      const delSet = delSaved ? new Set(JSON.parse(delSaved)) : new Set();

      if (medRes.ok) {
        const medData = await medRes.json();
        if (medData.success && Array.isArray(medData.data) && medData.data.length > 0) {
          const mapped = medData.data
            .map(mapDbProduct)
            .filter((p) => !delSet.has(p.product_id));
          setMedicineList(mapped);
          if (medData.total) setDbStatus((s) => ({ ...s, medicineCount: medData.total }));
        }
      }

      if (bkRes.ok) {
        const bkData = await bkRes.json();
        if (bkData.success && Array.isArray(bkData.data) && bkData.data.length > 0) {
          const mapped = bkData.data
            .map(mapDbProduct)
            .filter((p) => !delSet.has(p.product_id));
          setBlinkitList(mapped);
          if (bkData.total) setDbStatus((s) => ({ ...s, blinkitCount: bkData.total }));
        }
      }

      if (otcRes.ok) {
        const otcData = await otcRes.json();
        if (otcData.success && Array.isArray(otcData.data) && otcData.data.length > 0) {
          const mapped = otcData.data
            .map(mapDbProduct)
            .filter((p) => !delSet.has(p.product_id));
          setOtcList(mapped);
          if (otcData.total) setDbStatus((s) => ({ ...s, otcCount: otcData.total }));
        }
      }
    } catch (err) {
      console.warn("Failed to load products from DB:", err);
    }
  };

  const fetchStoredProductIds = async () => {
    try {
      const res = await fetch(`${API_BASE}/products/stored-ids`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.medicineIds)) setStoredMedicineIds(new Set(data.medicineIds));
          if (Array.isArray(data.blinkitIds)) setStoredBlinkitIds(new Set(data.blinkitIds));
          if (Array.isArray(data.otcIds)) setStoredOtcIds(new Set(data.otcIds));
        }
      }
    } catch (err) {
      console.warn("fetchStoredProductIds error:", err);
    }
  };

  const loadDeletedIds = async () => {
    try {
      const res = await fetch(`${API_BASE}/products/deleted-ids`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.deletedIds) && data.deletedIds.length > 0) {
          setDeletedProductIds((prev) => {
            const next = new Set([...prev, ...data.deletedIds]);
            try {
              localStorage.setItem("zepmed_deleted_product_ids", JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
          const delSet = new Set(data.deletedIds);
          setMedicineList((prev) => prev.filter((p) => !delSet.has(p.product_id)));
          setBlinkitList((prev) => prev.filter((p) => !delSet.has(p.product_id)));
          setOtcList((prev) => prev.filter((p) => !delSet.has(p.product_id)));
        }
      }
    } catch (err) {
      console.warn("Load deleted IDs error:", err);
    }
  };

  const checkDbStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/db/status`);
      if (res.ok) {
        const data = await res.json();
        setDbStatus({
          connected: true,
          host: data.host,
          medicineCount: data.medicineCount,
          blinkitCount: data.blinkitCount,
          otcCount: data.otcCount,
        });
      }
    } catch {
      setDbStatus({ connected: false, host: "82.25.121.184 (Hostinger Remote DB)" });
    }
  };

  const fetchApifyUsage = async (force = false) => {
    try {
      const res = await fetch(`${API_BASE}/apify/usage${force ? `?force=true&t=${Date.now()}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setApifyUsage(data);
          if (force) {
            setToastMessage(`⚡ Apify Live Balance अपडेट: $${data.remainingCreditsUsd} Available ($${data.usedCreditsUsd} Spent)`);
          }
        }
      }
    } catch (err) {
      console.warn("Fetch Apify usage error:", err);
    }
  };

  // Robust Clipboard Copy with Visual Feedback
  const copyToClipboard = (text, label, uniqueKey = null) => {
    if (text === undefined || text === null || text === "") return;
    const str = String(text).trim();
    const key = uniqueKey || label;

    const onSuccess = () => {
      setCopiedKey(key);
      setToastMessage(`📋 Copied [${label}]: "${str.length > 40 ? str.slice(0, 40) + '...' : str}"`);
      setTimeout(() => setCopiedKey(null), 2000);
      setTimeout(() => setToastMessage(""), 3500);
    };

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(str).then(onSuccess).catch(() => fallbackCopy(str, onSuccess));
    } else {
      fallbackCopy(str, onSuccess);
    }
  };

  const fallbackCopy = (str, cb) => {
    try {
      const el = document.createElement("textarea");
      el.value = str;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      cb();
    } catch {
      setToastMessage(`✓ Value selected: ${str.slice(0, 30)}`);
    }
  };

  const handleSectionSwitch = (section) => {
    if (section === "analysis" && !isLoggedIn) {
      setShowLoginModal(true);
      return;
    }
    setActiveSection(section);
    setSearchQuery("");
    if (section === "medicine") setActiveCategory("🔥 All Medicines (28-Cols)");
    if (section === "blinkit") setActiveCategory("🔥 All Blinkit Groceries (28-Cols)");
    if (section === "otc") setActiveCategory("🔥 All OTC Products (28-Cols)");
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");

    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPass = loginPassword.trim();

    if (cleanEmail === "db@zepmed.com" && cleanPass === "Zepmed@7030") {
      setIsLoggedIn(true);
      localStorage.setItem("zepmed_admin_logged", "true");
      setShowLoginModal(false);
      setActiveSection("analysis");
      setToastMessage("✅ Admin Verification Successful! Welcome to Product Analysis Dashboard.");
      setTimeout(() => setToastMessage(""), 5000);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setIsLoggedIn(true);
        localStorage.setItem("zepmed_admin_logged", "true");
        setShowLoginModal(false);
        setActiveSection("analysis");
      } else {
        setLoginError(data.message || "Invalid Login ID or Password.");
      }
    } catch {
      setLoginError("Invalid Login ID or Password. Expected DB@Zepmed.com / Zepmed@7030");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem("zepmed_admin_logged");
    setActiveSection("medicine");
    setToastMessage("Logged out of Product Analysis.");
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Continuous Auto-Generator (Streams Authentic Products via Apify Actor / DB Cache)
  const toggleContinuousGenerator = async () => {
    if (isGenerating) {
      generatorRunningRef.current = false;
      setIsGenerating(false);
      setToastMessage(`⏹️ Auto-Generator थांबवला. एकूण ${generatedCount} अस्सल प्रॉडक्ट्स जोडले.`);
      setTimeout(() => setToastMessage(""), 5000);
      return;
    }

    generatorRunningRef.current = true;
    setIsGenerating(true);
    let batchIdx = 0;
    const actorLabel =
      activeSection === "medicine"
        ? "Tata 1mg Actor (Strict)"
        : activeSection === "blinkit"
        ? "Blinkit Actor (Strict)"
        : "Tata 1mg OTC Actor (Strict)";
    setToastMessage(`⚡ ${actorLabel} द्वारे सातत्यपूर्ण रिअल डेटा ऑटो-जनरेशन सुरू झाले आहे (जोपर्यंत तुम्ही Stop करत नाही तोपर्यंत चालू राहील)...`);

    while (generatorRunningRef.current) {
      try {
        const res = await fetch(`${API_BASE}/scrape/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: activeSection, batchIndex: batchIdx }),
        });

        if (!generatorRunningRef.current) break;

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.products && data.products.length > 0) {
            batchIdx++;
            const isCache = data.source === "database_cache";
            if (activeSection === "medicine") {
              setMedicineList((prev) => {
                const existing = new Set(prev.map((p) => p.product_id));
                const fresh = data.products.filter(
                  (p) => !existing.has(p.product_id) && !deletedProductIds.has(p.product_id) && !downloadedProductIds.has(p.product_id)
                );
                setGeneratedCount((c) => c + fresh.length);
                return [...fresh, ...prev.slice(0, 100)];
              });
              setStoredMedicineIds((prev) => {
                const next = new Set(prev);
                data.products.forEach((p) => next.add(p.product_id));
                return next;
              });
            } else if (activeSection === "blinkit") {
              setBlinkitList((prev) => {
                const existing = new Set(prev.map((p) => p.product_id));
                const fresh = data.products.filter(
                  (p) => !existing.has(p.product_id) && !deletedProductIds.has(p.product_id) && !downloadedProductIds.has(p.product_id)
                );
                setGeneratedCount((c) => c + fresh.length);
                return [...fresh, ...prev.slice(0, 100)];
              });
              setStoredBlinkitIds((prev) => {
                const next = new Set(prev);
                data.products.forEach((p) => next.add(p.product_id));
                return next;
              });
            } else {
              setOtcList((prev) => {
                const existing = new Set(prev.map((p) => p.product_id));
                const fresh = data.products.filter(
                  (p) => !existing.has(p.product_id) && !deletedProductIds.has(p.product_id) && !downloadedProductIds.has(p.product_id)
                );
                setGeneratedCount((c) => c + fresh.length);
                return [...fresh, ...prev];
              });
              setStoredOtcIds((prev) => {
                const next = new Set(prev);
                data.products.forEach((p) => next.add(p.product_id));
                return next;
              });
            }

            if (isCache) {
              setToastMessage(`🎯 DB Cache Hit: '${data.query}' चे ${data.products.length} प्रॉडक्ट्स लोड झाले (0 Apify Credits)! स्ट्रीमिंग चालू आहे...`);
            } else {
              setToastMessage(`⚡ Live Scraped: '${data.query}' चे ${data.products.length} नवीन अस्सल प्रॉडक्ट्स लोड झाले! स्ट्रीमिंग चालू आहे...`);
            }
          } else {
            batchIdx++;
          }
        }
      } catch (err) {
        console.warn("Continuous bulk generator error:", err);
      }

      if (!generatorRunningRef.current) break;
      // 1.0 second pause between batches for ultra-fast streaming & responsive UI
      fetchApifyUsage();
      await new Promise((r) => setTimeout(r, 1000));
    }

    setIsGenerating(false);
    fetchApifyUsage();
  };

  const fetchDatasetStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/dataset/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBatchStatus((prev) => ({
            ...prev,
            currentRowIndex: data.currentRowIndex || 0,
            currentBatchIndex: data.currentBatchIndex || 0,
            totalRows: data.totalRows || 253973,
            totalBatches: data.totalBatches || 16932,
            percentCompleted: data.percentCompleted || 0,
            totalProcessed: data.totalProcessed || data.currentRowIndex || 0,
            lastMedicineName: data.lastMedicineName || prev.lastMedicineName,
            totalInDb: data.totalInDb || prev.totalInDb,
          }));
        }
      }
    } catch (err) {
      console.warn("Dataset status fetch error:", err);
    }
  };

  const toggleBatchGenerator = async () => {
    if (isBatchGenerating) {
      batchGeneratorRunningRef.current = false;
      setIsBatchGenerating(false);
      setToastMessage(`⏹️ A-Z Batch जनरेटर थांबवला. चेकपॉइंट सुरक्षित सेव्ह झाला आहे (Row ${batchStatus.currentRowIndex.toLocaleString()}).`);
      setTimeout(() => setToastMessage(""), 5000);
      return;
    }

    batchGeneratorRunningRef.current = true;
    setIsBatchGenerating(true);
    setShowBatchDashboard(true);
    setToastMessage("🚀 A-Z Dataset Batch जनरेटर सुरू झाले... Checkpoint वरून अखंड प्रक्रिया चालू आहे!");

    while (batchGeneratorRunningRef.current) {
      const tStart = Date.now();
      try {
        const res = await fetch(`${API_BASE}/dataset/batch-scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 10 }),
        });

        if (!batchGeneratorRunningRef.current) break;

        if (res.ok) {
          const data = await res.json();
          const duration = Date.now() - tStart;

          if (data.isCompleted) {
            batchGeneratorRunningRef.current = false;
            setIsBatchGenerating(false);
            setToastMessage("🎉 अभिनंदन! संपूर्ण 2,53,973 औषधांचा डेटासेट यशस्वीरित्या पूर्ण झाला!");
            break;
          }

          if (data.success) {
            setBatchStatus((prev) => ({
              ...prev,
              currentRowIndex: data.currentRowIndex,
              currentBatchIndex: data.batchIndex,
              totalRows: data.totalRows,
              totalBatches: data.totalBatches,
              percentCompleted: data.percentCompleted,
              lastMedicineName: data.batchMeds ? data.batchMeds[data.batchMeds.length - 1] : prev.lastMedicineName,
              lastBatchMeds: data.batchMeds || [],
              lastSpeedMs: duration,
              totalInDb: data.totalInDb || prev.totalInDb,
            }));

            if (data.products && data.products.length > 0) {
              setMedicineList((prev) => {
                const existingIds = new Set(prev.map((p) => p.product_id));
                const fresh = data.products.filter(
                  (p) => !existingIds.has(p.product_id) && !deletedProductIds.has(p.product_id) && !downloadedProductIds.has(p.product_id)
                );
                return [...fresh, ...prev.slice(0, 100)];
              });
              if (data.totalInDb) {
                setDbStatus((s) => ({ ...s, medicineCount: data.totalInDb }));
              }
              setStoredMedicineIds((prev) => {
                const next = new Set(prev);
                data.products.forEach((p) => next.add(p.product_id));
                return next;
              });
            }

            const speedSec = (duration / 1000).toFixed(1);
            setToastMessage(`⚡ Batch #${data.batchIndex} (${data.percentCompleted}%): १० औषधे डायरेक्ट लिंक्ससह प्रोसेस झाली [${speedSec}s] ('${(data.batchMeds || []).slice(0, 2).join(", ")}'...). Checkpoint: Row ${data.currentRowIndex.toLocaleString()}`);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          console.warn("Batch scrape error:", errData);
        }
      } catch (err) {
        console.warn("Batch scrape network error:", err);
      }

      if (!batchGeneratorRunningRef.current) break;
      fetchApifyUsage();
      await new Promise((r) => setTimeout(r, 800));
    }

    setIsBatchGenerating(false);
    fetchApifyUsage();
  };

  const handleResetCheckpoint = async () => {
    if (isBatchGenerating) {
      batchGeneratorRunningRef.current = false;
      setIsBatchGenerating(false);
    }
    const confirmed = window.confirm("⚠️ तुम्ही चेकपॉइंट रिसेट करून पुन्हा पहिल्यापासून (Row 0 / Batch 0) सुरू करू इच्छिता का?");
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/dataset/reset-checkpoint`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBatchStatus((prev) => ({
            ...prev,
            currentRowIndex: 0,
            currentBatchIndex: 0,
            percentCompleted: 0,
            totalProcessed: 0,
            lastMedicineName: "",
            lastBatchMeds: [],
          }));
          setToastMessage("🔄 चेकपॉइंट यशस्वीरित्या रिसेट झाला. नवीन बॅच आता Row 0 पासून सुरू होईल.");
        }
      }
    } catch (err) {
      console.error("Reset checkpoint error:", err);
    }
  };

  // Blinkit 27,555 Products Batch Auto-Generator Controller
  const fetchBlinkitBatchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/blinkit/batch-status`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBlinkitBatchStatus((prev) => ({
            ...prev,
            currentRowIndex: data.currentRowIndex,
            currentBatchIndex: data.currentBatchIndex,
            totalRows: data.totalRows || 27555,
            totalBatches: data.totalBatches || 2756,
            percentCompleted: data.percentCompleted || 0,
            batchSize: data.batchSize || 10,
            totalProcessed: data.totalProcessed || data.currentRowIndex,
            lastProductName: data.lastProductName || "",
            totalInDb: data.totalInDb || 0,
          }));
        }
      }
    } catch (err) {
      console.warn("Failed to fetch Blinkit batch status:", err);
    }
  };

  const toggleBlinkitBatchGenerator = async () => {
    if (isBlinkitBatchGenerating) {
      blinkitBatchRunningRef.current = false;
      setIsBlinkitBatchGenerating(false);
      setToastMessage(`⏹️ Blinkit Batch जनरेटर थांबवला. चेकपॉइंट सुरक्षित सेव्ह झाला आहे (Row ${blinkitBatchStatus.currentRowIndex.toLocaleString()}).`);
      setTimeout(() => setToastMessage(""), 5000);
      return;
    }

    blinkitBatchRunningRef.current = true;
    setIsBlinkitBatchGenerating(true);
    setShowBlinkitBatchDashboard(true);
    setToastMessage("🚀 Blinkit 27,555 Batch जनरेटर सुरू झाले... अखंड प्रक्रिया चालू आहे!");

    let consecutiveErrors = 0;

    while (blinkitBatchRunningRef.current) {
      const startTime = Date.now();
      try {
        const res = await fetch(`${API_BASE}/blinkit/batch-process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 10 }),
        });

        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }

        const data = await res.json();
        const elapsed = Date.now() - startTime;

        if (data.success) {
          consecutiveErrors = 0;

          if (data.isCompleted) {
            blinkitBatchRunningRef.current = false;
            setIsBlinkitBatchGenerating(false);
            setToastMessage("🎉 अभिनंदन! संपूर्ण 27,555 Blinkit उत्पादने यशस्वीरित्या डेटाबेसमध्ये सेव्ह झाली!");
            break;
          }

          setBlinkitBatchStatus((prev) => ({
            ...prev,
            currentRowIndex: data.currentRowIndex,
            currentBatchIndex: data.batchIndex,
            totalRows: data.totalRows || 27555,
            totalBatches: data.totalBatches || 552,
            percentCompleted: data.percentCompleted,
            totalProcessed: (prev.totalProcessed || 0) + (data.processedCount || 0),
            lastProductName: data.lastProductName || "",
            lastSpeedMs: elapsed,
            totalInDb: data.totalInDb,
          }));

          // Live prepend newly inserted products into local product list if active section is blinkit
          if (Array.isArray(data.products) && data.products.length > 0) {
            setProducts((prev) => {
              const existingIds = new Set(prev.map((p) => p.product_id));
              const freshMapped = data.products
                .filter((p) => !existingIds.has(p.product_id))
                .map(mapDbProduct);
              return [...freshMapped, ...prev.slice(0, 100)];
            });
            setDbStatus((s) => ({
              ...s,
              blinkitCount: data.totalInDb,
            }));
            setStoredBlinkitIds((prev) => {
              const next = new Set(prev);
              data.products.forEach((p) => next.add(p.product_id));
              return next;
            });
          }

          setToastMessage(
            `⚡ Batch #${data.batchIndex} पूर्ण! Row ${data.currentRowIndex.toLocaleString()} / ${data.totalRows.toLocaleString()} (${data.percentCompleted}%). +${data.storedCount || data.processedCount} उत्पादने Hostinger DB मध्ये सुरक्षित!`
          );
        } else {
          throw new Error(data.error || "Batch processing failed");
        }
      } catch (err) {
        console.error("Blinkit Batch Loop Error:", err);
        consecutiveErrors++;
        setToastMessage(`⚠️ Blinkit Batch त्रुटी: ${err.message}. पुन्हा प्रयत्न करत आहे... (${consecutiveErrors}/3)`);
        if (consecutiveErrors >= 3) {
          blinkitBatchRunningRef.current = false;
          setIsBlinkitBatchGenerating(false);
          setToastMessage(`❌ सलग 3 त्रुटी आल्यामुळे Blinkit Batch थांबवला. Checkpoint वरून कधीही पुन्हा सुरू करू शकता.`);
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!blinkitBatchRunningRef.current) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    setIsBlinkitBatchGenerating(false);
  };

  const handleResetBlinkitCheckpoint = async () => {
    if (isBlinkitBatchGenerating) {
      blinkitBatchRunningRef.current = false;
      setIsBlinkitBatchGenerating(false);
    }
    const confirmed = window.confirm("⚠️ तुम्ही Blinkit चेकपॉइंट रिसेट करून पुन्हा पहिल्यापासून (Row 0 / Batch 0) सुरू करू इच्छिता का?");
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/blinkit/reset-checkpoint`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBlinkitBatchStatus((prev) => ({
            ...prev,
            currentRowIndex: 0,
            currentBatchIndex: 0,
            percentCompleted: 0,
            totalProcessed: 0,
            lastProductName: "",
          }));
          setToastMessage("🔄 Blinkit चेकपॉइंट रिसेट झाला: पुन्हा Row 0 वरून सुरू होईल.");
          setTimeout(() => setToastMessage(""), 4000);
        }
      }
    } catch (err) {
      console.error("Reset Blinkit checkpoint error:", err);
    }
  };

  // 🔬 ScraperAPI Medicine Refill Engine Handlers
  const fetchScraperStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/scraper/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setScraperStatus(data);
          if (data.checkpoint?.apiKey && !scraperApiKey) {
            setScraperApiKey(data.checkpoint.apiKey);
          }
          if (data.checkpoint?.delayMs && !isDelayUserModified.current) {
            setScraperDelay(data.checkpoint.delayMs);
          }
        }
      }
    } catch (err) {
      console.warn("Scraper status fetch error:", err);
    }
  };

  const handleDelayChange = async (newDelayVal) => {
    const val = parseInt(newDelayVal, 10);
    isDelayUserModified.current = true;
    setScraperDelay(val);
    try {
      const res = await fetch(`${API_BASE}/scraper/update-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: scraperApiKey || "direct_free_mode", delayMs: val })
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage(`⚡ डिले यशस्वीरीत्या ${val}ms वर सेट झाला!`);
      }
    } catch (err) {
      console.error("Delay update error:", err);
      setToastMessage("❌ डिले अपडेट एरर: " + err.message);
    } finally {
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

  const handleStartScraper = async () => {
    setIsScraperActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/scraper/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: scraperApiKey || "direct_free_mode", delayMs: scraperDelay })
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage("⚡ Direct 1mg Free Refill चालू झाला! औषधे एकामागून एक थेट 1mg वरून मोफत भरली जात आहेत.");
        fetchScraperStatus();
      }
    } catch (err) {
      setToastMessage("❌ Refill Start Error: " + err.message);
    } finally {
      setIsScraperActionLoading(false);
      setTimeout(() => setToastMessage(""), 5000);
    }
  };

  const handleStopScraper = async () => {
    setIsScraperActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/scraper/stop`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setToastMessage("⏸️ Direct 1mg Refill थांबवला. चेकपॉइंट सुरक्षित सेव्ह झाला आहे.");
        fetchScraperStatus();
      }
    } catch (err) {
      setToastMessage("❌ Refill Stop Error: " + err.message);
    } finally {
      setIsScraperActionLoading(false);
      setTimeout(() => setToastMessage(""), 5000);
    }
  };

  const handleUpdateScraperKey = async () => {
    await handleDelayChange(scraperDelay);
  };

  const handleEnrichBatch = async (count = 5) => {
    setIsScraperActionLoading(true);
    setToastMessage(`⚡ Direct Free Mode द्वारे पुढील ${count} औषधांचा डेटा भरत आहे...`);
    try {
      const res = await fetch(`${API_BASE}/scraper/enrich-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, apiKey: scraperApiKey })
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage(`✅ पुढील ${data.count} औषधे यशस्वीरीत्या MySQL मध्ये रिफिल झाली!`);
        fetchScraperStatus();
        loadProductsFromDb();
      }
    } catch (err) {
      setToastMessage("❌ Batch Enrich Error: " + err.message);
    } finally {
      setIsScraperActionLoading(false);
      setTimeout(() => setToastMessage(""), 5000);
    }
  };

  const handleResetScraperCheckpoint = async () => {
    const targetId = prompt("चेकपॉइंट कोणत्या ID वर रीसेट करायचा आहे? (0 टाकल्यास सुरुवातीपासून सुरू होईल):", "0");
    if (targetId === null) return;
    try {
      const res = await fetch(`${API_BASE}/scraper/reset-checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetId: parseInt(targetId, 10) || 0 })
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage(`🔄 चेकपॉइंट ID ${targetId} वर रीसेट झाला.`);
        fetchScraperStatus();
      }
    } catch (err) {
      alert("Reset Error: " + err.message);
    }
  };

  useEffect(() => {
    return () => {
      generatorRunningRef.current = false;
      batchGeneratorRunningRef.current = false;
      blinkitBatchRunningRef.current = false;
    };
  }, []);

  // Store in Hostinger MySQL Database (28 Columns with Deduplication)
  const handleStoreInDatabase = async (itemsToStore) => {
    const isMed = activeSection === "medicine";
    const isBlinkit = activeSection === "blinkit";
    const endpoint = isMed
      ? `${API_BASE}/medicines/store`
      : isBlinkit
      ? `${API_BASE}/blinkit/store`
      : `${API_BASE}/otc/store`;
    const list = Array.isArray(itemsToStore) ? itemsToStore : [itemsToStore];

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(list),
      });

      if (res.ok) {
        const data = await res.json();
        if (isMed) {
          setStoredMedicineIds((prev) => {
            const next = new Set(prev);
            list.forEach((item) => next.add(item.product_id));
            return next;
          });
        } else if (isBlinkit) {
          setStoredBlinkitIds((prev) => {
            const next = new Set(prev);
            list.forEach((item) => next.add(item.product_id));
            return next;
          });
        } else {
          setStoredOtcIds((prev) => {
            const next = new Set(prev);
            list.forEach((item) => next.add(item.product_id));
            return next;
          });
        }
        setToastMessage(`💾 Hostinger MySQL: ${data.stored} प्रॉडक्ट्स (२८ कॉलम्स + Live URL) सेव्ह झाले! एकूण DB मध्ये: ${data.totalInDb}`);
        checkDbStatus();
        fetchStoredProductIds();
        loadProductsFromDb();
      } else {
        markStoredLocally(list, activeSection);
      }
    } catch {
      markStoredLocally(list, activeSection);
    }
    setTimeout(() => setToastMessage(""), 5000);
  };

  const markStoredLocally = (list, section) => {
    if (section === "medicine") {
      setStoredMedicineIds((prev) => {
        const next = new Set(prev);
        list.forEach((item) => next.add(item.product_id));
        return next;
      });
    } else if (section === "blinkit") {
      setStoredBlinkitIds((prev) => {
        const next = new Set(prev);
        list.forEach((item) => next.add(item.product_id));
        return next;
      });
    } else {
      setStoredOtcIds((prev) => {
        const next = new Set(prev);
        list.forEach((item) => next.add(item.product_id));
        return next;
      });
    }
    setToastMessage(`💾 ${list.length} प्रॉडक्ट्स Database Queue मध्ये सुरक्षित सेव्ह झाले!`);
  };

  // Smart Real-time Search & Filter with Stop-Word Removal & Single Product Accuracy
  const currentList =
    activeSection === "medicine"
      ? medicineList
      : activeSection === "blinkit"
      ? blinkitList
      : otcList;
  const currentStoredIds =
    activeSection === "medicine"
      ? storedMedicineIds
      : activeSection === "blinkit"
      ? storedBlinkitIds
      : storedOtcIds;

  const filteredProducts = useMemo(() => {
    let list = currentList.filter((p) => !deletedProductIds.has(p.product_id));

    // Deduplication filter
    if (hideStoredInDb) {
      list = list.filter((p) => !currentStoredIds.has(p.product_id));
    }

    const cleanQ = searchQuery.trim().toLowerCase();

    // If search query is present, strictly match relevant product(s)!
    if (cleanQ) {
      const stopWords = new Set(["in", "on", "at", "to", "for", "of", "and", "or", "a", "an", "the", "with", "is", "by", "from", "2", "1", "+", "&"]);
      const tokens = cleanQ
        .replace(/[+&,.-]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 1 && !stopWords.has(w));

      const scored = [];
      for (const p of list) {
        const nameLower = (p.product_name || "").toLowerCase();
        const brandLower = (p.brand || "").toLowerCase();
        const catLower = (p.category || "").toLowerCase();
        const subCatLower = (p.sub_category || "").toLowerCase();
        const compLower = (p.composition || "").toLowerCase();
        const saltLower = (p.generic_salt || "").toLowerCase();
        const pidLower = (p.product_id || "").toLowerCase();
        const usesLower = (p.uses || "").toLowerCase();
        const blob = `${nameLower} ${brandLower} ${catLower} ${subCatLower} ${compLower} ${saltLower} ${pidLower} ${usesLower}`;

        let score = 0;

        // Exact phrase match in name
        if (nameLower.includes(cleanQ)) {
          score += 150;
        } else if (blob.includes(cleanQ)) {
          score += 100;
        }

        if (tokens.length > 0) {
          const matched = tokens.filter((t) => blob.includes(t));
          if (matched.length === tokens.length) {
            score += 80;
          } else if (tokens.length >= 2 && matched.length >= Math.ceil(tokens.length * 0.65)) {
            score += 40 + matched.length * 5;
          } else if (tokens.length === 1 && matched.length === 1) {
            score += 50;
          }
        }

        if (score > 0) {
          scored.push({ p, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.map((s) => s.p);
    }

    // Category filter (applied when search query is empty)
    if (activeCategory && !activeCategory.includes("All")) {
      const catList =
        activeSection === "medicine"
          ? MEDICINE_CATEGORIES
          : activeSection === "blinkit"
          ? BLINKIT_CATEGORIES
          : OTC_CATEGORIES;
      const matched = catList.find((c) => c.label === activeCategory);
      if (matched && matched.query !== "all") {
        const words = matched.query.toLowerCase().split(/\s+/).filter(Boolean);
        list = list.filter((p) => {
          const blob = `${p.product_name} ${p.category} ${p.sub_category} ${p.brand || ""}`.toLowerCase();
          return words.some((w) => blob.includes(w));
        });
      }
    }

    return list;
  }, [currentList, activeSection, activeCategory, searchQuery, hideStoredInDb, currentStoredIds]);

  // Reset page index on search/filter/section changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeSection, activeCategory, hideStoredInDb]);

  // Fast Virtualized Pagination & Windowing (Zero Main-Thread Freezes)
  const totalItems = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(startIndex, endIndex);
  }, [filteredProducts, startIndex, endIndex]);

  const renderPaginationBar = (position = "top") => {
    if (totalItems === 0) return null;
    return (
      <div className={`zepmed-pagination-bar ${position}`}>
        <div className="pagination-info">
          Showing <strong>{startIndex + 1}</strong> - <strong>{endIndex}</strong> of <strong>{totalItems.toLocaleString()}</strong> products (Page <strong>{safeCurrentPage}</strong> of <strong>{totalPages}</strong>)
        </div>
        <div className="pagination-controls">
          <button
            type="button"
            className="page-nav-btn"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage(1)}
            title="First Page"
          >
            ⏮ First
          </button>
          <button
            type="button"
            className="page-nav-btn"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            title="Previous Page"
          >
            ◀ Prev
          </button>
          <span className="page-current-indicator">
            Page {safeCurrentPage} / {totalPages}
          </span>
          <button
            type="button"
            className="page-nav-btn"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            title="Next Page"
          >
            Next ▶
          </button>
          <button
            type="button"
            className="page-nav-btn"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            title="Last Page"
          >
            Last ⏭
          </button>
          <div className="page-size-selector">
            <label>Per page:</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
      </div>
    );
  };

  // Dedicated Live Apify Scraper Function (Tata 1mg Actor: dzTaO7bhlAGsNXfCA, Blinkit Actor: boe8aOsEUY8g0lBj0)
  const executeLiveApifyScrape = async (customQuery) => {
    const query = (customQuery || searchQuery).trim();
    if (!query) return;

    setIsScrapingLive(true);
    const actorName =
      activeSection === "medicine"
        ? "Tata 1mg Scraper"
        : activeSection === "blinkit"
        ? "Blinkit Scraper"
        : "Tata 1mg OTC Scraper";
    setToastMessage(`⚡ Apify Actor द्वारे '${query}' ची थेट लाईव्ह स्क्रॅपिंग सुरू आहे (${actorName})... कृपया थांबा.`);

    try {
      const res = await fetch(`${API_BASE}/scrape/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, section: activeSection }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.products && data.products.length > 0) {
          if (activeSection === "medicine") {
            setMedicineList((prev) => {
              const existingIds = new Set(prev.map((p) => p.product_id));
              const newItems = data.products.filter(
                (p) => !existingIds.has(p.product_id) && !downloadedProductIds.has(p.product_id) && !deletedProductIds.has(p.product_id)
              );
              return [...newItems, ...prev];
            });
            setStoredMedicineIds((prev) => {
              const next = new Set(prev);
              data.products.forEach((p) => next.add(p.product_id));
              return next;
            });
          } else if (activeSection === "blinkit") {
            setBlinkitList((prev) => {
              const existingIds = new Set(prev.map((p) => p.product_id));
              const newItems = data.products.filter(
                (p) => !existingIds.has(p.product_id) && !downloadedProductIds.has(p.product_id) && !deletedProductIds.has(p.product_id)
              );
              return [...newItems, ...prev];
            });
            setStoredBlinkitIds((prev) => {
              const next = new Set(prev);
              data.products.forEach((p) => next.add(p.product_id));
              return next;
            });
          } else {
            setOtcList((prev) => {
              const existingIds = new Set(prev.map((p) => p.product_id));
              const newItems = data.products.filter(
                (p) => !existingIds.has(p.product_id) && !downloadedProductIds.has(p.product_id) && !deletedProductIds.has(p.product_id)
              );
              return [...newItems, ...prev];
            });
            setStoredOtcIds((prev) => {
              const next = new Set(prev);
              data.products.forEach((p) => next.add(p.product_id));
              return next;
            });
          }
          if (data.source === "database_cache") {
            setToastMessage(`🎯 '${query}' डेटाबेसमध्ये आधीच उपलब्ध होता (${data.products.length} प्रॉडक्ट्स, 0 Apify क्रेडिट्स वापरले)!`);
          } else {
            setToastMessage(`✅ ${actorName} द्वारे '${query}' चा अस्सल डेटा स्क्रॅप झाला (${data.products.length} प्रॉडक्ट्स)!`);
            fetchApifyUsage();
          }
          setIsScrapingLive(false);
          setTimeout(() => setToastMessage(""), 5000);
          return;
        } else {
          setToastMessage(`❌ Apify Actor: '${query}' साठी कोणताही अस्सल प्रॉडक्ट सापडला नाही.`);
          setIsScrapingLive(false);
          setTimeout(() => setToastMessage(""), 5000);
          return;
        }
      } else {
        setToastMessage(`❌ Apify सर्व्हर एरर आला (${res.status}). कृपया सर्व्हर तपासा.`);
      }
    } catch (err) {
      console.warn("Apify live scrape error:", err);
      setToastMessage(`❌ बॅकएंड सर्व्हरशी संपर्क होऊ शकला नाही. कृपया http://localhost:5000 चालू असल्याची खात्री करा.`);
    }

    setIsScrapingLive(false);
    setTimeout(() => setToastMessage(""), 5000);
  };

  // Click handler for "Search Product" button or Enter key
  const handleSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    // 1. If matching products already exist in current catalog, display them instantly!
    if (filteredProducts.length > 0) {
      setToastMessage(`🎯 '${query}' साठी ${filteredProducts.length} प्रॉडक्ट सापडले!`);
      setTimeout(() => setToastMessage(""), 4000);
      return;
    }

    // 2. Product is NOT in current directory: Directly trigger Live Apify Actor scraping!
    await executeLiveApifyScrape(query);
  };

  const handleAddCustomProduct = (query) => {
    handleSearchSubmit(null);
  };

  // 🌐 Global Full-Database Search Handler (Queries 20,872+ items in Hostinger MySQL)
  const handleExecuteGlobalSearch = async (queryToSearch) => {
    const q = (queryToSearch || analysisSearchQuery).trim();
    if (!q) {
      alert("कृपया शोधण्यासाठी प्रॉडक्टचे नाव किंवा सॉल्ट टाईप करा!");
      return;
    }

    setIsGlobalSearching(true);
    setToastMessage(`🔍 संपूर्ण डेटाबेसमध्ये '${q}' शोधत आहे (${activeSectionDbTotal.toLocaleString()} प्रॉडक्ट्स)...`);

    try {
      const url = `${API_BASE}/products/global-search?query=${encodeURIComponent(q)}&section=${analysisActiveSection}&limit=250`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        const mapped = (data.data || []).map(mapDbProduct).filter((p) => !deletedProductIds.has(p.product_id));
        setGlobalSearchResults(mapped);
        setGlobalSearchMeta({
          query: q,
          totalFound: data.totalFound || mapped.length,
          count: mapped.length,
          section: analysisActiveSection,
        });

        if (mapped.length > 0) {
          setToastMessage(`🎯 '${q}' साठी संपूर्ण डेटाबेसमधून ${data.totalFound || mapped.length} प्रॉडक्ट्स सापडले!`);
        } else {
          setToastMessage(`⚠️ '${q}' साठी संपूर्ण डेटाबेसमध्ये कोणताही प्रॉडक्ट सापडला नाही.`);
        }
      } else {
        throw new Error(data.error || "Search failed");
      }
    } catch (err) {
      setToastMessage(`❌ Global Search त्रुटी: ${err.message}`);
    } finally {
      setIsGlobalSearching(false);
      setTimeout(() => setToastMessage(""), 5000);
    }
  };

  const handleClearGlobalSearch = () => {
    setGlobalSearchResults(null);
    setGlobalSearchMeta({ query: "", totalFound: 0, count: 0, section: "medicine" });
    setAnalysisSearchQuery("");
    setToastMessage("🔄 Recent 150 प्रॉडक्ट्सची लिस्ट पुन्हा लोड केली.");
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Permanent Product Deletion & Blacklist Handlers (One-by-One and Delete-All)
  const handleDeleteProduct = async (productId, section) => {
    const isMed = section === "medicine";
    const isBk = section === "blinkit";
    const targetProduct = (isMed ? medicineList : isBk ? blinkitList : otcList).find((p) => p.product_id === productId);
    const prodName = targetProduct ? targetProduct.product_name : productId;

    const confirmed = window.confirm(
      `⚠️ तुम्ही नक्की '${prodName}' (ID: ${productId}) कायमचा डिलीट करू इच्छिता का?\n\nहा प्रॉडक्ट डेटाबेसमधून कायमचा नष्ट होईल आणि पुन्हा कधीही डिस्प्ले होणार नाही.`
    );
    if (!confirmed) return;

    // 1. Update Blacklist state & localStorage immediately
    setDeletedProductIds((prev) => {
      const next = new Set(prev);
      next.add(productId);
      try {
        localStorage.setItem("zepmed_deleted_product_ids", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    // 2. Remove from active product lists
    if (isMed) {
      setMedicineList((prev) => prev.filter((p) => p.product_id !== productId));
    } else if (isBk) {
      setBlinkitList((prev) => prev.filter((p) => p.product_id !== productId));
    } else {
      setOtcList((prev) => prev.filter((p) => p.product_id !== productId));
    }

    setToastMessage(`🗑️ '${prodName}' कायमचा डिलीट करण्यात आला आहे!`);
    setTimeout(() => setToastMessage(""), 5000);

    // 3. Notify backend API to delete from MySQL table and insert into permanent blacklist
    try {
      await fetch(`${API_BASE}/products/${section}/${productId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.warn("Backend delete error:", err);
    }
  };

  const handleDeleteAllProducts = async (section) => {
    const isMed = section === "medicine";
    const isBk = section === "blinkit";
    const currentActiveList = isMed
      ? medicineList.filter((p) => !deletedProductIds.has(p.product_id))
      : isBk
      ? blinkitList.filter((p) => !deletedProductIds.has(p.product_id))
      : otcList.filter((p) => !deletedProductIds.has(p.product_id));

    const sectionLabel = isMed ? "💊 Medicine" : isBk ? "⚡ Blinkit" : "🌿 OTC";

    if (currentActiveList.length === 0) {
      alert(`या ${sectionLabel} सेक्शनमध्ये डिलीट करण्यासाठी कोणतेही प्रॉडक्ट्स उपलब्ध नाहीत.`);
      return;
    }

    const confirmed = window.confirm(
      `🚨 अत्यंत महत्त्वाचे (DANGER ZONE)!\n\nतुम्ही ${sectionLabel} विभागातील सर्व ${currentActiveList.length} प्रॉडक्ट्स एकाच वेळी कायमचे (Permanently) डिलीट करू इच्छिता का?\n\nहे सर्व प्रॉडक्ट्स Hostinger MySQL डेटाबेसमधून नष्ट होतील आणि ब्लॅकलिस्ट केले जातील!`
    );
    if (!confirmed) return;

    const idsToDelete = currentActiveList.map((p) => p.product_id);

    // 1. Update Blacklist
    setDeletedProductIds((prev) => {
      const next = new Set(prev);
      idsToDelete.forEach((id) => next.add(id));
      try {
        localStorage.setItem("zepmed_deleted_product_ids", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    // 2. Clear from state
    if (isMed) {
      setMedicineList([]);
    } else if (isBk) {
      setBlinkitList([]);
    } else {
      setOtcList([]);
    }

    setToastMessage(`🗑️ ${sectionLabel} चे सर्व ${idsToDelete.length} प्रॉडक्ट्स कायमचे डिलीट झाले!`);
    setTimeout(() => setToastMessage(""), 6000);

    // 3. Notify Backend API
    try {
      await fetch(`${API_BASE}/products/${section}/delete-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, productIds: idsToDelete }),
      });
    } catch (err) {
      console.warn("Backend delete all error:", err);
    }
  };

  // Dynamic active section products (excluding blacklisted/deleted)
  const currentSectionActiveList = useMemo(() => {
    // If Global Full-Database Search results are active for this section, display them!
    if (globalSearchResults && globalSearchMeta.section === analysisActiveSection) {
      return globalSearchResults.filter((p) => !deletedProductIds.has(p.product_id));
    }

    const rawList =
      analysisActiveSection === "medicine"
        ? medicineList
        : analysisActiveSection === "blinkit"
        ? blinkitList
        : otcList;
    return rawList.filter((p) => !deletedProductIds.has(p.product_id));
  }, [analysisActiveSection, medicineList, blinkitList, otcList, deletedProductIds, globalSearchResults, globalSearchMeta]);

  // Unique Categories for active section with item counts
  const availableAnalysisCategories = useMemo(() => {
    const catMap = new Map();
    for (const p of currentSectionActiveList) {
      const cat = p.category || "Uncategorized";
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    }
    return Array.from(catMap.entries()).map(([category, count]) => ({ category, count }));
  }, [currentSectionActiveList]);

  // Unique Subcategories for active section & selected category with item counts
  const availableAnalysisSubCategories = useMemo(() => {
    let pool = currentSectionActiveList;
    if (analysisSelectedCategory && analysisSelectedCategory !== "all") {
      pool = pool.filter((p) => p.category === analysisSelectedCategory);
    }
    const subMap = new Map();
    for (const p of pool) {
      const sub = p.sub_category || "General";
      subMap.set(sub, (subMap.get(sub) || 0) + 1);
    }
    return Array.from(subMap.entries()).map(([subcategory, count]) => ({ subcategory, count }));
  }, [currentSectionActiveList, analysisSelectedCategory]);

  // Dynamic Category & Subcategory Breakdown for Top Analytics Panels
  const medicineCategoryBreakdown = useMemo(() => {
    const active = medicineList.filter((p) => !deletedProductIds.has(p.product_id));
    if (active.length === 0) return [];
    const catMap = new Map();
    for (const p of active) {
      const c = p.category || "General Medicine";
      if (!catMap.has(c)) {
        catMap.set(c, { count: 0, subcategories: new Set() });
      }
      const entry = catMap.get(c);
      entry.count++;
      if (p.sub_category) entry.subcategories.add(p.sub_category);
    }
    return Array.from(catMap.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      pct: Math.round((data.count / active.length) * 100),
      subs: Array.from(data.subcategories).slice(0, 3).join(", "),
    }));
  }, [medicineList, deletedProductIds]);

  const blinkitCategoryBreakdown = useMemo(() => {
    const active = blinkitList.filter((p) => !deletedProductIds.has(p.product_id));
    if (active.length === 0) return [];
    const catMap = new Map();
    for (const p of active) {
      const c = p.category || "General Grocery";
      if (!catMap.has(c)) {
        catMap.set(c, { count: 0, subcategories: new Set() });
      }
      const entry = catMap.get(c);
      entry.count++;
      if (p.sub_category) entry.subcategories.add(p.sub_category);
    }
    return Array.from(catMap.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      pct: Math.round((data.count / active.length) * 100),
      subs: Array.from(data.subcategories).slice(0, 3).join(", "),
    }));
  }, [blinkitList, deletedProductIds]);

  const otcCategoryBreakdown = useMemo(() => {
    const active = otcList.filter((p) => !deletedProductIds.has(p.product_id));
    if (active.length === 0) return [];
    const catMap = new Map();
    for (const p of active) {
      const c = p.category || "OTC Healthcare Medicine";
      if (!catMap.has(c)) {
        catMap.set(c, { count: 0, subcategories: new Set() });
      }
      const entry = catMap.get(c);
      entry.count++;
      if (p.sub_category) entry.subcategories.add(p.sub_category);
    }
    return Array.from(catMap.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      pct: Math.round((data.count / active.length) * 100),
      subs: Array.from(data.subcategories).slice(0, 3).join(", "),
    }));
  }, [otcList, deletedProductIds]);

  // Filtered list for Product Analysis Scrollable Box with Category + Subcategory Segregation
  const analysisFilteredList = useMemo(() => {
    let list = currentSectionActiveList;

    // Filter by selected Category
    if (analysisSelectedCategory && analysisSelectedCategory !== "all") {
      list = list.filter((p) => p.category === analysisSelectedCategory);
    }

    // Filter by selected Subcategory
    if (analysisSelectedSubCategory && analysisSelectedSubCategory !== "all") {
      list = list.filter((p) => (p.sub_category || "General") === analysisSelectedSubCategory);
    }

    // Filter by search query
    if (analysisSearchQuery.trim()) {
      const q = analysisSearchQuery.trim().toLowerCase();
      list = list.filter((p) => {
        const blob = `${p.product_name} ${p.product_id} ${p.brand || ""} ${p.category || ""} ${p.sub_category || ""} ${p.generic_salt || ""}`.toLowerCase();
        return blob.includes(q);
      });
    }

    return list;
  }, [currentSectionActiveList, analysisSelectedCategory, analysisSelectedSubCategory, analysisSearchQuery]);

  // Active section full DB count for Complete CSV Export
  const activeSectionDbTotal =
    analysisActiveSection === "medicine"
      ? (dbStatus.medicineCount || medicineList.length || 0)
      : analysisActiveSection === "blinkit"
      ? (dbStatus.blinkitCount || blinkitList.length || 0)
      : (dbStatus.otcCount || otcList.length || 0);

  // Download Entire Database for Active Section directly from Hostinger MySQL (Zero Browser RAM lag)
  const handleDownloadAllDatabaseData = (section) => {
    const targetSection = section || analysisActiveSection || "medicine";
    const totalCount =
      targetSection === "medicine"
        ? (dbStatus.medicineCount || medicineList.length || 0)
        : targetSection === "blinkit"
        ? (dbStatus.blinkitCount || blinkitList.length || 0)
        : (dbStatus.otcCount || otcList.length || 0);

    const friendlyName =
      targetSection === "medicine"
        ? "Medicine Data (औषधे)"
        : targetSection === "blinkit"
        ? "Blinkit Products (किराणा)"
        : "OTC Products";

    setToastMessage(`🚀 Hostinger MySQL वरून संपूर्ण ${totalCount.toLocaleString()} ${friendlyName} चा 28-Column CSV तयार होत आहे... थेट डाऊनलोड सुरू होत आहे!`);

    const link = document.createElement("a");
    link.href = `${API_BASE}/export/full-csv?section=${targetSection}`;
    link.download = `zepmed_${targetSection}_FULL_ALL_PRODUCTS_28col.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => setToastMessage(""), 6000);
  };

  // Specific Data Download (Downloads selected Category & Subcategory items in 28 columns and marks in MySQL)
  const handleDownloadSpecificData = async (itemsToDownload, label = "specific") => {
    const list = itemsToDownload || analysisFilteredList;
    if (!list || list.length === 0) {
      alert("डाऊनलोड करण्यासाठी कोणतेही प्रॉडक्ट्स उपलब्ध नाहीत.");
      return;
    }

    const productIds = list.map((p) => p.product_id);

    // 1. Mark as downloaded in state
    setDownloadedProductIds((prev) => {
      const next = new Set(prev);
      productIds.forEach((id) => next.add(id));
      return next;
    });

    // 2. Mark as downloaded in Hostinger MySQL (is_downloaded = 1)
    try {
      await fetch(`${API_BASE}/export/mark-downloaded`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: analysisActiveSection, productIds }),
      });
    } catch (err) {
      console.warn("Mark downloaded error:", err);
    }

    // 3. Export CSV with 28 columns + Product URL
    const clean = (val) => `"${String(val || "").replace(/"/g, '""').replace(/\r?\n|\r/g, " ")}"`;
    const rows = list.map((p) => [
      clean(p.product_id),
      clean(p.product_name),
      clean(p.product_url || ""),
      clean(`<img src="${p.image_url || p.image_thumb}" width="40" height="40" />`),
      clean(p.image_status || "Active"),
      clean(p.category_id || (analysisActiveSection === "medicine" ? "CAT-RX-01" : analysisActiveSection === "blinkit" ? "CAT-101" : "CAT-OTC-02")),
      clean(p.category),
      clean(p.sub_category),
      clean(p.brand),
      p.mrp,
      p.selling_price,
      clean(p.discount_pct || "0%"),
      clean(p.allow_discount || "Yes"),
      clean(p.unit),
      p.units_per_pack || 1,
      p.packs_per_box || (analysisActiveSection === "medicine" ? 50 : 24),
      clean(p.composition),
      clean(p.generic_salt),
      clean(p.manufacturer),
      clean(p.description),
      clean(p.uses),
      clean(p.side_effects),
      clean(p.dosage),
      clean(p.health_tags),
      clean(p.prescription_required),
      clean(p.customer_visible),
      clean(p.active),
      clean(p.approval_status),
      clean(p.image_url || p.image_thumb),
    ]);

    const csvContent = "\uFEFF" + [EXACT_28_COLUMNS.join(","), ...rows.map((e) => e.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const catPart = (analysisSelectedCategory !== "all" ? analysisSelectedCategory : "all_cat").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
    const subPart = (analysisSelectedSubCategory !== "all" ? analysisSelectedSubCategory : "all_sub").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
    link.download = `zepmed_${analysisActiveSection}_${catPart}_${subPart}_28col_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage(`📥 ${list.length} स्पेसिफिक प्रॉडक्ट्स (${analysisActiveSection.toUpperCase()}) २८ कॉलम्स CSV मध्ये डाऊनलोड झाले आणि डेटाबेसमध्ये सेव्ह झाले!`);
    setTimeout(() => setToastMessage(""), 6000);
  };

  // Category-Wise Export & Archive Tracking
  const availableExportCategories = useMemo(() => {
    let list = medicineList;
    if (exportSection === "blinkit") list = blinkitList;
    if (exportSection === "otc") list = otcList;
    const cats = new Set(list.map((p) => p.category).filter(Boolean));
    return Array.from(cats);
  }, [exportSection, medicineList, blinkitList, otcList]);

  const availableExportSubCategories = useMemo(() => {
    let list = medicineList;
    if (exportSection === "blinkit") list = blinkitList;
    if (exportSection === "otc") list = otcList;
    let pool = list;
    if (exportCategory !== "all") {
      pool = pool.filter((p) => p.category === exportCategory);
    }
    const subs = new Set(pool.map((p) => p.sub_category).filter(Boolean));
    return Array.from(subs);
  }, [exportSection, exportCategory, medicineList, blinkitList, otcList]);

  const handleCategoryExport = async () => {
    let list = exportSection === "medicine" ? medicineList : exportSection === "blinkit" ? blinkitList : otcList;
    let itemsToExport = list;

    if (exportCategory !== "all") {
      itemsToExport = itemsToExport.filter((p) => p.category === exportCategory);
    }

    if (exportSubCategory !== "all") {
      itemsToExport = itemsToExport.filter((p) => p.sub_category === exportSubCategory);
    }

    if (itemsToExport.length === 0) {
      alert("No products found for selected category/subcategory.");
      return;
    }

    handleDownloadSpecificData(itemsToExport, `${exportCategory}_${exportSubCategory}`);
  };

  // Export 28-Column CSV for All Sections with Live Product URL
  const handleExportCSV = () => {
    const listToExport = filteredProducts;
    if (listToExport.length === 0) {
      alert("No products to export.");
      return;
    }

    const clean = (val) => `"${String(val || "").replace(/"/g, '""').replace(/\r?\n|\r/g, " ")}"`;

    const rows = listToExport.map((p) => [
      clean(p.product_id),
      clean(p.product_name),
      clean(p.product_url || ""),
      clean(`<img src="${p.image_url}" width="40" height="40" />`),
      clean(p.image_status || "Active"),
      clean(p.category_id || (activeSection === "medicine" ? "CAT-RX-01" : activeSection === "blinkit" ? "CAT-101" : "CAT-OTC-02")),
      clean(p.category),
      clean(p.sub_category),
      clean(p.brand),
      p.mrp,
      p.selling_price,
      clean(p.discount_pct || "0%"),
      clean(p.allow_discount || "Yes"),
      clean(p.unit),
      p.units_per_pack || 1,
      p.packs_per_box || (activeSection === "medicine" ? 50 : 24),
      clean(p.composition),
      clean(p.generic_salt),
      clean(p.manufacturer),
      clean(p.description),
      clean(p.uses),
      clean(p.side_effects),
      clean(p.dosage),
      clean(p.health_tags),
      clean(p.prescription_required),
      clean(p.customer_visible),
      clean(p.active),
      clean(p.approval_status),
      clean(p.image_url)
    ]);

    const csvContent = "\uFEFF" + [EXACT_28_COLUMNS.join(","), ...rows.map((e) => e.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeSection}_28_column_catalog_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const currentCategories =
    activeSection === "medicine"
      ? MEDICINE_CATEGORIES
      : activeSection === "blinkit"
      ? BLINKIT_CATEGORIES
      : OTC_CATEGORIES;

  // Smart Category Fallback Image Resolver (Eliminates single milk bottle fallback)
  const getCategoryFallbackImage = (prod) => {
    if (activeSection === "medicine" || activeSection === "otc") {
      return "https://onemg.gumlet.io/l_watermark_346,w_480,h_480/a_ignore,w_480,h_480,c_fit,q_auto,f_auto/cropped/buhk7yptjggz25hwwgqj.jpg";
    }
    const cat = (prod?.category || "").toLowerCase();
    const name = (prod?.product_name || "").toLowerCase();
    if (name.includes("notebook") || name.includes("book") || name.includes("pen") || cat.includes("stationery")) {
      return "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=480&q=80&auto=format&fit=crop";
    }
    if (name.includes("noodle") || name.includes("pasta") || name.includes("maggi") || name.includes("soup")) {
      return "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=480&q=80&auto=format&fit=crop";
    }
    if (name.includes("flour") || name.includes("quinoa") || name.includes("atta") || name.includes("baking")) {
      return "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=480&q=80&auto=format&fit=crop";
    }
    if (name.includes("oil") || name.includes("shampoo") || cat.includes("beauty") || cat.includes("hair")) {
      return "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=480&q=80&auto=format&fit=crop";
    }
    if (name.includes("bottle") || name.includes("flask") || cat.includes("kitchen")) {
      return "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=480&q=80&auto=format&fit=crop";
    }
    if (cat.includes("cleaning") || name.includes("spray") || name.includes("wash") || name.includes("detergent")) {
      return "https://images.unsplash.com/photo-1585421514738-01798e348b17?w=480&q=80&auto=format&fit=crop";
    }
    if (cat.includes("snack") || name.includes("biscuit") || name.includes("cookie") || name.includes("chips")) {
      return "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=480&q=80&auto=format&fit=crop";
    }
    if (cat.includes("beverage") || name.includes("tea") || name.includes("coffee") || name.includes("drink")) {
      return "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=480&q=80&auto=format&fit=crop";
    }
    return "https://images.unsplash.com/photo-1542838132-92c53300491e?w=480&q=80&auto=format&fit=crop";
  };

  // Helper Copy Button component
  const CopyBtn = ({ val, label, uid }) => {
    const isCopied = copiedKey === uid;
    return (
      <button
        type="button"
        className={`copy-icon-btn ${isCopied ? "copied" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          copyToClipboard(val, label, uid);
        }}
        title={`Copy ${label} to clipboard`}
      >
        {isCopied ? "✓ Copied" : "📋 Copy"}
      </button>
    );
  };

  return (
    <div className="app-container">
      {/* 1. TOP NAVBAR */}
      <nav className="top-navbar">
        <div className="navbar-left">
          <div className="logo-box">
            <span className="logo-icon">⚡</span>
            <div className="logo-text">
              <h1>ZEPMED ENTERPRISE CATALOG</h1>
              <span className="logo-sub">28-Column High-Speed Multi-Scraper System</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeSection === "medicine" ? "active med-active" : ""}`}
            onClick={() => handleSectionSwitch("medicine")}
          >
            💊 Medicine Section (28-Cols)
            <span className="tab-count-badge">{(dbStatus.medicineCount || medicineList.length).toLocaleString()}</span>
          </button>

          <button
            className={`nav-tab-btn ${activeSection === "blinkit" ? "active bk-active" : ""}`}
            onClick={() => handleSectionSwitch("blinkit")}
          >
            ⚡ Blinkit Section (28-Cols)
            <span className="tab-count-badge">{(dbStatus.blinkitCount || blinkitList.length).toLocaleString()}</span>
          </button>

          <button
            className={`nav-tab-btn ${activeSection === "otc" ? "active otc-active" : ""}`}
            onClick={() => handleSectionSwitch("otc")}
          >
            🌿 OTC Section (28-Cols)
            <span className="tab-count-badge">{(dbStatus.otcCount || otcList.length).toLocaleString()}</span>
          </button>

          <button
            className={`nav-tab-btn ${activeSection === "scraper" ? "active scraper-active" : ""}`}
            onClick={() => handleSectionSwitch("scraper")}
          >
            ⚡ Direct 1mg Free Refill
            <span className={`tab-count-badge ${scraperStatus.isRunning ? "tab-badge-pulsing" : ""}`}>
              {scraperStatus.isRunning ? "🟢 Active" : `${(scraperStatus.stats?.totalProcessed || 504).toLocaleString()} Done`}
            </span>
          </button>

          <button
            className={`nav-tab-btn ${activeSection === "analysis" ? "active analysis-active" : ""}`}
            onClick={() => handleSectionSwitch("analysis")}
          >
            📊 Product Analysis
            {isLoggedIn && <span className="tab-auth-badge">Admin</span>}
          </button>
        </div>

        {/* Database Status Badge & Real-Time Apify USD Tracker Box */}
        <div className="navbar-right">
          <div className={`db-indicator ${dbStatus.connected ? "connected" : "offline"}`}>
            <span className="db-dot"></span>
            <div>
              <div className="db-title">Hostinger MySQL: {dbStatus.connected ? "Connected" : "Standby"}</div>
              <div className="db-host">{dbStatus.host} | DB: u869403905_zepemd_DB</div>
            </div>
          </div>

          {/* Real-time Apify USD Tracker Box directly underneath Hostinger badge */}
          {(() => {
            const rem = apifyUsage.remainingCreditsUsd != null ? Number(apifyUsage.remainingCreditsUsd) : 5.00;
            const tot = apifyUsage.totalCreditsUsd != null ? Number(apifyUsage.totalCreditsUsd) : 5.00;
            const spent = apifyUsage.usedCreditsUsd != null ? Number(apifyUsage.usedCreditsUsd) : 0.00;
            const remPct = tot > 0 ? Number(((rem / tot) * 100).toFixed(1)) : 100;
            const spentPct = tot > 0 ? Number(((spent / tot) * 100).toFixed(1)) : 0;

            return (
              <div className="apify-usd-box" title={`Apify Live Balance: $${rem.toFixed(2)} Available out of $${tot.toFixed(2)} USD`}>
                <div className="apify-usd-top">
                  <div className="apify-usd-title">
                    <span className="apify-icon">⚡</span>
                    <span className="apify-lbl">Apify Credits</span>
                  </div>
                  <div className="apify-usd-val">
                    <span className="usd-avail">${rem.toFixed(2)}</span>
                    <span className="usd-avail-badge">Available</span>
                  </div>
                  <button
                    type="button"
                    className="apify-refresh-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchApifyUsage(true);
                    }}
                    title="Refresh Live Apify Balance"
                  >
                    🔄
                  </button>
                </div>
                <div className="apify-usd-bar-track" title={`खर्च: $${spent.toFixed(2)} (${spentPct}% of $${tot.toFixed(2)} USD)`}>
                  <div
                    className={`apify-usd-bar-fill ${
                      spentPct > 80 ? "danger" : spentPct > 50 ? "warn" : "good"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, spentPct))}%` }}
                  ></div>
                </div>
                <div className="apify-usd-sub">
                  <span>Spent: <strong className="usd-spent">${spent.toFixed(2)}</strong></span>
                  <span className="usd-divider">•</span>
                  <span>Total: <strong>${tot.toFixed(2)} USD</strong></span>
                  <span className="usd-pct" style={{ color: spentPct > 80 ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                    ({spentPct}% used • ${rem.toFixed(2)} left)
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </nav>

      {/* 2. SUB-HEADER BAR */}
      {activeSection !== "analysis" && (
        <header className="sub-header">
          <div className="header-top-row">
            {/* Deduplication Switch */}
            <div className="dedup-control">
              <label className="checkbox-label" title="Hide products already saved in MySQL">
                <input
                  type="checkbox"
                  checked={hideStoredInDb}
                  onChange={(e) => setHideStoredInDb(e.target.checked)}
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-text">
                  Hide Products Already Stored in DB ({activeSection === "medicine" ? storedMedicineIds.size : activeSection === "blinkit" ? storedBlinkitIds.size : storedOtcIds.size} saved)
                </span>
              </label>
            </div>

            {/* Instant Real-Time Search Bar with Search Product Button */}
            <form onSubmit={handleSearchSubmit} className="search-form-wrap">
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder={
                    activeSection === "medicine"
                      ? "Search medicine via Tata 1mg (Vicks, Dolo, Zifi, Augmentin, etc.)..."
                      : activeSection === "blinkit"
                      ? "Search grocery via Blinkit (Mountain Breeze, Amul Milk, Maggi, etc.)..."
                      : "Search OTC via Tata 1mg (Volini, Moov, Revital, Chyawanprash, etc.)..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="clear-search-btn"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                className={`search-submit-btn ${isScrapingLive ? "scraping-pulse" : ""}`}
                title={`Search product (checks DB first, then strictly ${activeSection === "medicine" ? "Tata 1mg Actor" : activeSection === "blinkit" ? "Blinkit Actor" : "Tata 1mg OTC Actor"})`}
                disabled={isScrapingLive}
              >
                {isScrapingLive 
                  ? `⚡ Scraping ${activeSection === "medicine" ? "Tata 1mg" : activeSection === "blinkit" ? "Blinkit" : "Tata 1mg OTC"}...` 
                  : "🔍 Search Product"}
              </button>
              <button
                type="button"
                className="apify-force-btn"
                onClick={() => executeLiveApifyScrape(searchQuery)}
                title={`Direct Live ${activeSection === "medicine" ? "Tata 1mg Actor" : activeSection === "blinkit" ? "Blinkit Actor" : "Tata 1mg OTC Actor"}`}
                disabled={isScrapingLive || !searchQuery.trim()}
              >
                ⚡ Live {activeSection === "medicine" ? "Tata 1mg" : activeSection === "blinkit" ? "Blinkit" : "Tata 1mg OTC"} Actor
              </button>
            </form>

            {/* Actions */}
            <div className="header-actions">
              {/* Continuous Auto-Generator */}
              <button
                className={`stream-gen-btn ${isGenerating ? "running" : ""}`}
                onClick={toggleContinuousGenerator}
                title="Continuously streams 100+ items until stopped"
              >
                {isGenerating
                  ? `⏹️ Stop Generator (${generatedCount}+ Streaming)`
                  : "▶️ Auto-Generate (100+ Items)"}
              </button>

              {/* A-Z Dataset Batch-wise Auto-Generator */}
              {activeSection === "medicine" && (
                <button
                  type="button"
                  className={`dataset-batch-btn ${isBatchGenerating ? "running" : ""}`}
                  onClick={toggleBatchGenerator}
                  title="Auto-Generate Batch-wise from 2,53,973 Indian Medicines Dataset with Checkpoint"
                >
                  {isBatchGenerating
                    ? `⏹️ Stop A-Z Batch (#${batchStatus.currentBatchIndex})`
                    : "🚀 A-Z Batch Auto-Gen"}
                </button>
              )}

              {/* Blinkit 27,555 Products Batch Auto-Generator */}
              {activeSection === "blinkit" && (
                <button
                  type="button"
                  className={`dataset-batch-btn blinkit-neon ${isBlinkitBatchGenerating ? "running" : ""}`}
                  onClick={toggleBlinkitBatchGenerator}
                  title="Auto-Generate Batch-wise from 27,555 Blinkit Products Dataset with Checkpoint"
                >
                  {isBlinkitBatchGenerating
                    ? `⏹️ Stop Blinkit Batch (#${blinkitBatchStatus.currentBatchIndex})`
                    : "🚀 Blinkit Batch Auto-Gen"}
                </button>
              )}

              {/* Store All in DB */}
              <button
                className="store-db-btn"
                onClick={() => handleStoreInDatabase(filteredProducts)}
                title="Saves all visible products to Hostinger MySQL with deduplication"
              >
                💾 Store All in DB ({filteredProducts.length})
              </button>

              {/* Download CSV */}
              <button
                className="export-btn"
                onClick={handleExportCSV}
                title="Download full 28-Column CSV file"
              >
                📥 Download 28-Col CSV
              </button>
            </div>
          </div>

          {/* Quick Categories Bar */}
          <div className="category-bar">
            {currentCategories.map((cat) => (
              <button
                key={cat.label}
                className={`cat-pill ${activeCategory === cat.label ? "active" : ""}`}
                onClick={() => {
                  setActiveCategory(cat.label);
                  setSearchQuery("");
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </header>
      )}

      {/* 3. MAIN CONTENT */}
      <main className="main-content">
        {toastMessage && (
          <div className="toast-banner">
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage("")}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontWeight: 700, color: "white" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* SECTION A: PRODUCT ANALYSIS */}
        {activeSection === "analysis" ? (
          <div className="analysis-dashboard">
            <div className="analytics-banner">
              <div>
                <h2>📊 ZepMed Product Intelligence & Market Analysis</h2>
                <p>Comprehensive 28-Column Analytics of Both Medicine & Blinkit Grocery Catalogs</p>
                <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                  <span style={{ background: "rgba(255,255,255,0.2)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
                    👤 Admin: DB@Zepmed.com
                  </span>
                  <span style={{ background: "rgba(16,185,129,0.3)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", border: "1px solid #34d399" }}>
                    🟢 Hostinger Remote MySQL (82.25.121.184)
                  </span>
                </div>
              </div>

              <button
                style={{
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                onClick={handleLogout}
              >
                🔒 Logout
              </button>
            </div>

            {/* Analysis Navigation Sub-Tabs: Overview vs Product Comparison */}
            <div className="analysis-subtabs-bar">
              <button
                type="button"
                className={`analysis-subtab-btn ${analysisSubTab === "overview" ? "active" : ""}`}
                onClick={() => setAnalysisSubTab("overview")}
              >
                📊 Catalog Overview & Segregation
              </button>
              <button
                type="button"
                className={`analysis-subtab-btn ${analysisSubTab === "compare" ? "active" : ""}`}
                onClick={() => setAnalysisSubTab("compare")}
              >
                ⚖️ Compare Products (CSV / Excel vs Database)
              </button>
            </div>

            {analysisSubTab === "compare" ? (
              <ProductComparison
                apiBase={API_BASE}
                onScrapeMissing={(prodName) => {
                  setActiveSection("medicine");
                  setSearchQuery(prodName);
                  executeLiveApifyScrape(prodName);
                }}
              />
            ) : (
              <>
                {/* 4 Big Metrics Cards */}
            <div className="analytics-grid-4">
              <div className="stat-metric-card">
                <div className="stat-metric-val">{medicineList.length + blinkitList.length + otcList.length}</div>
                <div className="stat-metric-lbl">Total Monitored 28-Column SKUs</div>
                <div className="stat-metric-sub">Medicines: {medicineList.length} | Blinkit: {blinkitList.length} | OTC: {otcList.length}</div>
              </div>

              <div className="stat-metric-card">
                <div className="stat-metric-val">
                  ₹{(
                    medicineList.reduce((s, p) => s + (p.selling_price * (p.packs_per_box || 50)), 0) +
                    blinkitList.reduce((s, p) => s + (p.selling_price * (p.packs_per_box || 24)), 0) +
                    otcList.reduce((s, p) => s + (p.selling_price * (p.packs_per_box || 50)), 0)
                  ).toLocaleString("en-IN")}
                </div>
                <div className="stat-metric-lbl">Total Estimated Stock Valuation</div>
                <div className="stat-metric-sub">Calculated via Live Wholesale Pack Sizes</div>
              </div>

              <div className="stat-metric-card">
                <div className="stat-metric-val">
                  {(
                    blinkitList.reduce((s, p) => s + parseFloat(p.discount_pct || 0), 0) /
                    (blinkitList.length || 1)
                  ).toFixed(1)}%
                </div>
                <div className="stat-metric-lbl">Average Blinkit Discount Margin</div>
                <div className="stat-metric-sub">Highest Discount: 23% OFF on Dairy & Staples</div>
              </div>

              <div className="stat-metric-card">
                <div className="stat-metric-val">28 Columns</div>
                <div className="stat-metric-lbl">Unified Schema Matching</div>
                <div className="stat-metric-sub">100% Matching Structure Across All 3 Sections</div>
              </div>
            </div>

            {/* Detailed Analytics Grid with Dynamic Category + Subcategory Aggregations */}
            <div className="analytics-dual-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
              <div className="analytics-panel">
                <h3>💊 Medicine Therapeutic Formulation Split</h3>
                <div className="cat-breakdown-list">
                  {medicineCategoryBreakdown.length === 0 ? (
                    <div style={{ padding: "16px", color: "#94a3b8", fontSize: "13px" }}>No medicines in catalog.</div>
                  ) : (
                    medicineCategoryBreakdown.map((item) => (
                      <div
                        key={item.name}
                        className="breakdown-item clickable"
                        onClick={() => {
                          setAnalysisActiveSection("medicine");
                          setAnalysisSelectedCategory(item.name);
                          setAnalysisSelectedSubCategory("all");
                        }}
                        title={`Click to filter '${item.name}' in manager`}
                      >
                        <div className="breakdown-info">
                          <span className="breakdown-name">
                            📁 {item.name}
                            {item.subs && <span className="breakdown-subs"> • Sub: {item.subs}</span>}
                          </span>
                          <span className="breakdown-count">{item.count} Medicines ({item.pct}%)</span>
                        </div>
                        <div className="breakdown-bar-track">
                          <div className="breakdown-bar-fill med" style={{ width: `${item.pct}%` }}></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="analytics-panel">
                <h3>⚡ Blinkit Grocery Category Distribution</h3>
                <div className="cat-breakdown-list">
                  {blinkitCategoryBreakdown.length === 0 ? (
                    <div style={{ padding: "16px", color: "#94a3b8", fontSize: "13px" }}>No grocery items in catalog.</div>
                  ) : (
                    blinkitCategoryBreakdown.map((item) => (
                      <div
                        key={item.name}
                        className="breakdown-item clickable"
                        onClick={() => {
                          setAnalysisActiveSection("blinkit");
                          setAnalysisSelectedCategory(item.name);
                          setAnalysisSelectedSubCategory("all");
                        }}
                        title={`Click to filter '${item.name}' in manager`}
                      >
                        <div className="breakdown-info">
                          <span className="breakdown-name">
                            📁 {item.name}
                            {item.subs && <span className="breakdown-subs"> • Sub: {item.subs}</span>}
                          </span>
                          <span className="breakdown-count">{item.count} Items ({item.pct}%)</span>
                        </div>
                        <div className="breakdown-bar-track">
                          <div className="breakdown-bar-fill bk" style={{ width: `${item.pct}%` }}></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="analytics-panel">
                <h3>🌿 Tata 1mg OTC Healthcare Split</h3>
                <div className="cat-breakdown-list">
                  {otcCategoryBreakdown.length === 0 ? (
                    <div style={{ padding: "16px", color: "#94a3b8", fontSize: "13px" }}>No OTC items in catalog.</div>
                  ) : (
                    otcCategoryBreakdown.map((item) => (
                      <div
                        key={item.name}
                        className="breakdown-item clickable"
                        onClick={() => {
                          setAnalysisActiveSection("otc");
                          setAnalysisSelectedCategory(item.name);
                          setAnalysisSelectedSubCategory("all");
                        }}
                        title={`Click to filter '${item.name}' in manager`}
                      >
                        <div className="breakdown-info">
                          <span className="breakdown-name">
                            📁 {item.name}
                            {item.subs && <span className="breakdown-subs"> • Sub: {item.subs}</span>}
                          </span>
                          <span className="breakdown-count">{item.count} Items ({item.pct}%)</span>
                        </div>
                        <div className="breakdown-bar-track">
                          <div className="breakdown-bar-fill otc" style={{ width: `${item.pct}%` }}></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* PRODUCT MASTER & PERMANENT DELETION MANAGER WITH CATEGORY + SUBCATEGORY SEGREGATION */}
            <div className="product-manager-card">
              <div className="manager-header">
                <div className="manager-title-group">
                  <div className="manager-badge">🛠️ DATA MANAGEMENT & SEGREGATION CONTROL</div>
                  <h3>📁 Product Master & Category + Subcategory Segregation Manager</h3>
                  <p>
                    येथे तुम्ही Tata 1mg Medicine, Blinkit Grocery आणि Tata 1mg OTC चा संपूर्ण डेटा <strong>Category + Subcategory</strong> नुसार सेग्रीगेट (Segregate) करून पाहू शकता, हवा असलेला विशिष्ट (Specific) डेटा <strong>२८ कॉलम्स CSV</strong> मध्ये डाऊनलोड करू शकता, किंवा नको असलेले प्रॉडक्ट्स कायमचे डिलीट करू शकता.
                  </p>
                </div>

                <div className="manager-quick-actions">
                  <button
                    type="button"
                    className="download-specific-action-btn"
                    onClick={() => handleDownloadSpecificData(analysisFilteredList)}
                    title="Download currently filtered category & subcategory products in 28-column format"
                  >
                    📥 Download Specific CSV ({analysisFilteredList.length})
                  </button>
                  <button
                    type="button"
                    className="download-all-data-action-btn"
                    onClick={() => handleDownloadAllDatabaseData(analysisActiveSection)}
                    title={`Download ALL ${activeSectionDbTotal.toLocaleString()} products in full 28-column CSV directly from Hostinger MySQL`}
                  >
                    ⚡ Download ALL {activeSectionDbTotal.toLocaleString()} {analysisActiveSection === "medicine" ? "Medicines" : analysisActiveSection === "blinkit" ? "Blinkit" : "OTC"} (Full DB CSV)
                  </button>
                  <button
                    type="button"
                    className="delete-all-btn"
                    onClick={() => handleDeleteAllProducts(analysisActiveSection)}
                    title={`Permanently delete all ${analysisActiveSection === "medicine" ? "Medicine" : analysisActiveSection === "blinkit" ? "Blinkit" : "OTC"} products`}
                  >
                    🗑️ Delete All ({currentSectionActiveList.length})
                  </button>
                </div>
              </div>

              {/* Section Tabs & Category / Subcategory Controls inside the Manager */}
              <div className="manager-controls-bar">
                <div className="manager-tabs">
                  <button
                    type="button"
                    className={`manager-tab-btn ${analysisActiveSection === "medicine" ? "active med-active" : ""}`}
                    onClick={() => {
                      setAnalysisActiveSection("medicine");
                      setAnalysisSelectedCategory("all");
                      setAnalysisSelectedSubCategory("all");
                      setAnalysisSearchQuery("");
                      setGlobalSearchResults(null);
                    }}
                  >
                    💊 Medicine Data ({(dbStatus.medicineCount || medicineList.length).toLocaleString()})
                  </button>
                  <button
                    type="button"
                    className={`manager-tab-btn ${analysisActiveSection === "blinkit" ? "active bk-active" : ""}`}
                    onClick={() => {
                      setAnalysisActiveSection("blinkit");
                      setAnalysisSelectedCategory("all");
                      setAnalysisSelectedSubCategory("all");
                      setAnalysisSearchQuery("");
                      setGlobalSearchResults(null);
                    }}
                  >
                    ⚡ Blinkit Data ({(dbStatus.blinkitCount || blinkitList.length).toLocaleString()})
                  </button>
                  <button
                    type="button"
                    className={`manager-tab-btn ${analysisActiveSection === "otc" ? "active otc-active" : ""}`}
                    onClick={() => {
                      setAnalysisActiveSection("otc");
                      setAnalysisSelectedCategory("all");
                      setAnalysisSelectedSubCategory("all");
                      setAnalysisSearchQuery("");
                      setGlobalSearchResults(null);
                    }}
                  >
                    🌿 OTC Data ({(dbStatus.otcCount || otcList.length).toLocaleString()})
                  </button>
                </div>

                {/* Dynamic Category Selector Dropdown */}
                <div className="manager-filter-select-group">
                  <label className="manager-select-label">📁 Category:</label>
                  <select
                    className="manager-select-input"
                    value={analysisSelectedCategory}
                    onChange={(e) => {
                      setAnalysisSelectedCategory(e.target.value);
                      setAnalysisSelectedSubCategory("all");
                    }}
                  >
                    <option value="all">🔥 All Categories ({currentSectionActiveList.length})</option>
                    {availableAnalysisCategories.map((c) => (
                      <option key={c.category} value={c.category}>
                        {c.category} ({c.count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dynamic Subcategory Selector Dropdown */}
                <div className="manager-filter-select-group">
                  <label className="manager-select-label">📂 Subcategory:</label>
                  <select
                    className="manager-select-input"
                    value={analysisSelectedSubCategory}
                    onChange={(e) => setAnalysisSelectedSubCategory(e.target.value)}
                  >
                    <option value="all">✨ All Subcategories ({availableAnalysisSubCategories.reduce((acc, s) => acc + s.count, 0)})</option>
                    {availableAnalysisSubCategories.map((s) => (
                      <option key={s.subcategory} value={s.subcategory}>
                        {s.subcategory} ({s.count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search Box with Global Database Search Capability */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleExecuteGlobalSearch(analysisSearchQuery);
                  }}
                  className="manager-search-wrap"
                >
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="manager-search-input"
                    placeholder={`Search name, brand, salt... (Enter for Global DB Search)`}
                    value={analysisSearchQuery}
                    onChange={(e) => setAnalysisSearchQuery(e.target.value)}
                  />
                  {analysisSearchQuery && (
                    <button
                      type="button"
                      className="clear-search-btn"
                      onClick={() => {
                        setAnalysisSearchQuery("");
                        if (globalSearchResults) handleClearGlobalSearch();
                      }}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="submit"
                    className={`manager-global-search-btn ${isGlobalSearching ? "loading" : ""}`}
                    title={`Search '${analysisSearchQuery || "query"}' across all ${activeSectionDbTotal.toLocaleString()} items in MySQL`}
                    disabled={isGlobalSearching}
                  >
                    {isGlobalSearching ? "⏳ Searching DB..." : `🌐 Global DB Search`}
                  </button>
                  {globalSearchResults && (
                    <button
                      type="button"
                      className="manager-reset-search-btn"
                      onClick={handleClearGlobalSearch}
                      title="Reset back to recent 150 items"
                    >
                      ✕ Back to 150
                    </button>
                  )}
                </form>
              </div>

              {/* INTERACTIVE CATEGORY & SUBCATEGORY SEGREGATION CHIPS */}
              <div className="segregation-chips-panel">
                <div className="segregation-chips-header">
                  <span className="seg-header-title">
                    🏷️ <strong>Category & Subcategory Segregation Pills:</strong>
                  </span>
                  {(analysisSelectedCategory !== "all" || analysisSelectedSubCategory !== "all" || analysisSearchQuery || globalSearchResults) && (
                    <button
                      type="button"
                      className="reset-filters-chip"
                      onClick={() => {
                        setAnalysisSelectedCategory("all");
                        setAnalysisSelectedSubCategory("all");
                        setAnalysisSearchQuery("");
                        if (globalSearchResults) handleClearGlobalSearch();
                      }}
                    >
                      ✕ Reset All Filters {globalSearchResults ? "(Back to 150)" : ""}
                    </button>
                  )}
                </div>
                <div className="segregation-chips-row">
                  <button
                    type="button"
                    className={`seg-cat-pill ${analysisSelectedCategory === "all" ? "active" : ""}`}
                    onClick={() => {
                      setAnalysisSelectedCategory("all");
                      setAnalysisSelectedSubCategory("all");
                    }}
                  >
                    🔥 All ({currentSectionActiveList.length})
                  </button>
                  {availableAnalysisCategories.map((c) => (
                    <button
                      key={c.category}
                      type="button"
                      className={`seg-cat-pill ${analysisSelectedCategory === c.category ? "active" : ""}`}
                      onClick={() => {
                        setAnalysisSelectedCategory(c.category);
                        setAnalysisSelectedSubCategory("all");
                      }}
                    >
                      📁 {c.category} <span className="cat-pill-count">{c.count}</span>
                    </button>
                  ))}
                </div>

                {analysisSelectedCategory !== "all" && availableAnalysisSubCategories.length > 0 && (
                  <div className="segregation-subchips-row">
                    <span className="subchips-lead">↳ Subcategories in <strong>{analysisSelectedCategory}</strong>:</span>
                    <button
                      type="button"
                      className={`seg-subcat-pill ${analysisSelectedSubCategory === "all" ? "active" : ""}`}
                      onClick={() => setAnalysisSelectedSubCategory("all")}
                    >
                      ✨ All Subcategories
                    </button>
                    {availableAnalysisSubCategories.map((s) => (
                      <button
                        key={s.subcategory}
                        type="button"
                        className={`seg-subcat-pill ${analysisSelectedSubCategory === s.subcategory ? "active" : ""}`}
                        onClick={() => setAnalysisSelectedSubCategory(s.subcategory)}
                      >
                        🏷️ {s.subcategory} <span className="subcat-pill-count">{s.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* THE SCROLLABLE BOX WITH CUSTOM SCROLLBAR */}
              <div className="analysis-scroll-outer-box">
                <div className="scroll-box-meta-bar">
                  <span>
                    📋 <strong>{analysisFilteredList.length}</strong> Products Displayed
                    {analysisSelectedCategory !== "all" && <strong style={{ color: "#0284c7" }}> • 📁 {analysisSelectedCategory}</strong>}
                    {analysisSelectedSubCategory !== "all" && <strong style={{ color: "#d97706" }}> • 📂 {analysisSelectedSubCategory}</strong>}
                    {" "}({analysisActiveSection === "medicine" ? "Tata 1mg Medicines" : "Blinkit Groceries"})
                  </span>
                  <div className="scroll-meta-actions">
                    <button
                      type="button"
                      className="quick-download-specific-btn"
                      onClick={() => handleDownloadSpecificData(analysisFilteredList)}
                      title="Download displayed products in 28-column format"
                    >
                      📥 Download Displayed ({analysisFilteredList.length} Items)
                    </button>
                    <button
                      type="button"
                      className="download-all-full-btn"
                      onClick={() => handleDownloadAllDatabaseData(analysisActiveSection)}
                      title={`Download ALL ${activeSectionDbTotal.toLocaleString()} products in full 28-column CSV directly from Hostinger MySQL`}
                    >
                      ⚡ Download ALL {activeSectionDbTotal.toLocaleString()} {analysisActiveSection === "medicine" ? "Medicines" : analysisActiveSection === "blinkit" ? "Blinkit Products" : "OTC Items"} (Full DB CSV)
                    </button>
                    <span className="blacklist-indicator">
                      🚫 Permanently Deleted: {deletedProductIds.size} SKUs
                    </span>
                  </div>
                </div>

                <div className="analysis-scroll-content">
                  {/* Global Database Search Results Banner */}
                  {globalSearchResults && (
                    <div className="global-search-active-banner">
                      <div className="gs-banner-left">
                        <span className="gs-banner-badge">🌐 GLOBAL DATABASE RESULTS</span>
                        <span className="gs-banner-text">
                          Found <strong>{globalSearchMeta.totalFound}</strong> products matching <em>"{globalSearchMeta.query}"</em> across all <strong>{activeSectionDbTotal.toLocaleString()}</strong> items in Hostinger MySQL.
                        </span>
                      </div>
                      <button
                        type="button"
                        className="gs-banner-clear-btn"
                        onClick={handleClearGlobalSearch}
                        title="Reset back to recent 150 items"
                      >
                        ✕ Back to Recent 150 Items
                      </button>
                    </div>
                  )}

                  {analysisFilteredList.length === 0 ? (
                    <div className="manager-empty-state">
                      <div style={{ fontSize: "40px" }}>🔍</div>
                      {globalSearchResults ? (
                        <>
                          <h4>संपूर्ण डेटाबेसमध्ये '{analysisSearchQuery}' सापडला नाही</h4>
                          <p>
                            Hostinger MySQL मधील सर्व {activeSectionDbTotal.toLocaleString()} उत्पादनांमध्ये शोधले, परंतु कोणताही प्रॉडक्ट सापडला नाही.
                          </p>
                          <button
                            type="button"
                            className="empty-state-global-btn"
                            onClick={handleClearGlobalSearch}
                          >
                            ✕ सर्व प्रॉडक्ट्स परत दाखवा
                          </button>
                        </>
                      ) : analysisSearchQuery ? (
                        <>
                          <h4>'{analysisSearchQuery}' सध्या लोड केलेल्या 150 प्रॉडक्ट्समध्ये सापडला नाही</h4>
                          <p>
                            हा प्रॉडक्ट आपल्या संपूर्ण <strong>{activeSectionDbTotal.toLocaleString()}</strong> उत्पादनांच्या मुख्य डेटाबेसमध्ये असू शकतो! खालील बटण दाबून थेट मुख्य डेटाबेसमध्ये शोधा:
                          </p>
                          <button
                            type="button"
                            className="empty-state-global-btn"
                            onClick={() => handleExecuteGlobalSearch(analysisSearchQuery)}
                            disabled={isGlobalSearching}
                          >
                            {isGlobalSearching ? "⏳ डेटाबेस शोधत आहे..." : `🌐 संपूर्ण डेटाबेसमध्ये '${analysisSearchQuery}' शोधा (${activeSectionDbTotal.toLocaleString()} Items)`}
                          </button>
                        </>
                      ) : (
                        <>
                          <h4>कोणतेही प्रॉडक्ट्स शिल्लक नाहीत किंवा सापडले नाहीत</h4>
                          <p>या फिल्टरमध्ये कोणतेही प्रॉडक्ट्स उपलब्ध नाहीत.</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="manager-product-table-wrapper">
                      <table className="manager-table">
                        <thead>
                          <tr>
                            <th style={{ width: "60px" }}>Image</th>
                            <th style={{ width: "130px" }}>Product ID</th>
                            <th>Product Name & Brand</th>
                            <th style={{ width: "160px" }}>Category</th>
                            <th style={{ width: "160px" }}>Sub Category</th>
                            <th style={{ width: "85px" }}>MRP</th>
                            <th style={{ width: "110px" }}>Selling Price</th>
                            <th style={{ width: "130px" }}>Live Store URL</th>
                            <th style={{ width: "95px", textAlign: "center" }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisFilteredList.map((p) => (
                            <tr key={p.product_id} className="manager-row">
                              <td>
                                <img
                                  src={p.image_url || p.image_thumb}
                                  alt={p.product_name}
                                  className="manager-thumb"
                                  onError={(e) => {
                                    e.target.src = "https://placehold.co/44x44?text=Item";
                                  }}
                                />
                              </td>
                              <td>
                                <div className="manager-pid-badge">
                                  <span>{p.product_id}</span>
                                  <button
                                    className="copy-mini-btn"
                                    onClick={() => copyToClipboard(p.product_id, `man-pid-${p.product_id}`)}
                                    title="Copy Product ID"
                                  >
                                    {copiedKey === `man-pid-${p.product_id}` ? "✓" : "📋"}
                                  </button>
                                </div>
                              </td>
                              <td>
                                <div className="manager-name-col">
                                  <span className="manager-pname">{p.product_name}</span>
                                  <span className="manager-pbrand">{p.brand} • {p.unit}</span>
                                </div>
                              </td>
                              <td>
                                <span className="manager-cat-pill">{p.category}</span>
                              </td>
                              <td>
                                <span className="manager-subcat-pill">{p.sub_category || "General"}</span>
                              </td>
                              <td>
                                <span className="manager-mrp">₹{p.mrp}</span>
                              </td>
                              <td>
                                <span className="manager-price">₹{p.selling_price}</span>
                                <span className="manager-discount">({p.discount_pct || "0%"})</span>
                              </td>
                              <td>
                                {p.product_url ? (
                                  <a
                                    href={p.product_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="manager-url-link"
                                    title={p.product_url}
                                  >
                                    🔗 Open Store
                                  </a>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontSize: "11px" }}>No Link</span>
                                )}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <button
                                  className="delete-single-btn"
                                  onClick={() => handleDeleteProduct(p.product_id, analysisActiveSection)}
                                  title={`Permanently delete ${p.product_name}`}
                                >
                                  🗑️ Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CATEGORY-WISE PRODUCT DOWNLOAD & ARCHIVE MANAGER */}
            <div className="analytics-export-card">
              <div className="export-card-header">
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                    📥 Category-Wise Export & Deduplication Archive Manager
                  </h3>
                  <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
                    Download data category-wise from Hostinger MySQL. Downloaded products are archived as 'Old' so they are never re-scraped or regenerated, saving Apify credits.
                  </p>
                </div>
                <div className="archived-count-pill">
                  📦 Archived/Downloaded: {downloadedProductIds.size} SKUs
                </div>
              </div>

              <div className="export-controls-grid">
                <div className="export-control-item">
                  <label>Select Catalog Section:</label>
                  <select
                    className="export-select"
                    value={exportSection}
                    onChange={(e) => {
                      setExportSection(e.target.value);
                      setExportCategory("all");
                      setExportSubCategory("all");
                    }}
                  >
                    <option value="medicine">💊 Medicine Section (Tata 1mg Scraper)</option>
                    <option value="blinkit">⚡ Blinkit Section (Blinkit Quick-Commerce)</option>
                    <option value="otc">🌿 Tata 1mg OTC Healthcare (zepmed_otc_medicines)</option>
                  </select>
                </div>

                <div className="export-control-item">
                  <label>Select Category to Export:</label>
                  <select
                    className="export-select"
                    value={exportCategory}
                    onChange={(e) => {
                      setExportCategory(e.target.value);
                      setExportSubCategory("all");
                    }}
                  >
                    <option value="all">🔥 All Categories ({availableExportCategories.length})</option>
                    {availableExportCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="export-control-item">
                  <label>Select Subcategory to Export:</label>
                  <select
                    className="export-select"
                    value={exportSubCategory}
                    onChange={(e) => setExportSubCategory(e.target.value)}
                  >
                    <option value="all">✨ All Subcategories ({availableExportSubCategories.length})</option>
                    {availableExportSubCategories.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="export-control-item" style={{ justifyContent: "flex-end" }}>
                  <button
                    className="export-download-action-btn"
                    onClick={handleCategoryExport}
                  >
                    📥 Download Specific 28-Col CSV
                  </button>
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      ) : activeSection === "scraper" ? (
        /* SECTION C: SCRAPERAPI MEDICAL REFILL DASHBOARD */
        <div className="scraper-dashboard-view">
          {/* Top Banner */}
          <div className="scraper-hero-banner direct-free-hero">
            <div className="scraper-hero-left">
              <div className="scraper-hero-badge free-badge">
                <span className="live-dot-pulse"></span> ⚡ 100% FREE DIRECT 1MG ENGINE • ZERO CREDITS
              </div>
              <h2 className="scraper-hero-title">
                ⚡ Direct Tata 1mg Free Refill Engine
              </h2>
              <p className="scraper-hero-desc">
                Enriching <strong>Uses</strong>, <strong>Side Effects</strong>, <strong>Introduction</strong>, and <strong>Dosage</strong> directly from Tata 1mg into Hostinger MySQL. <strong>Zero ScraperAPI / Zero ZenRows credits needed!</strong> All <strong>{(scraperStatus.stats?.totalProcessed || 504).toLocaleString()}</strong> previously completed medicines are safely preserved.
              </p>
              <div className="scraper-scope-tags">
                <span className="scope-tag-safe">🔒 Target: zepmed_medicines Only</span>
                <span className="scope-tag-safe">🛡️ Blinkit Catalog Untouched & Safe</span>
                <span className="scope-tag-safe">₹0 Cost / Zero Toll</span>
                <span className="scope-tag-safe">♾️ Unlimited Free Requests</span>
              </div>
            </div>

            <div className="scraper-hero-right">
              <div className={`scraper-status-pill ${scraperStatus.isRunning ? "pill-running" : "pill-paused"}`}>
                <span className="status-dot"></span>
                <span>{scraperStatus.isRunning ? "Direct Free Worker Active" : "Worker Paused / Idle"}</span>
              </div>
              <div className="scraper-checkpoint-indicator">
                <span>Continuing from:</span> <strong>Row #{scraperStatus.checkpoint?.lastProcessedId || 3080}</strong>
              </div>
            </div>
          </div>

          {/* Engine Config & Safety Controls */}
          <div className="scraper-card scraper-key-card direct-free-config">
            <div className="scraper-key-header">
              <div className="scraper-key-title">
                <span className="key-icon">⚡</span>
                <div>
                  <h4>Direct Free Engine Configuration & Polite Delay</h4>
                  <p>
                    Scraping directly from Tata 1mg with authentic browser headers and polite request interval. 
                    <strong> No API keys or credit deductions!</strong> All {(scraperStatus.stats?.totalProcessed || 504).toLocaleString()} previously completed medicines are preserved.
                  </p>
                </div>
              </div>
              <div className="scraper-key-inputs">
                <div className="direct-mode-badge-pill">
                  🟢 100% Free & Unlimited Mode Active
                </div>
                <select
                  className="scraper-delay-select"
                  value={scraperDelay}
                  onChange={(e) => handleDelayChange(e.target.value)}
                  title="Polite delay between medicines"
                >
                  <option value={500}>🔥 500ms (Turbo)</option>
                  <option value={800}>⚡ 800ms (Very Fast)</option>
                  <option value={1000}>🏎️ 1000ms (Fast)</option>
                  <option value={1500}>🚀 1500ms (Recommended Safe)</option>
                  <option value={2000}>🛡️ 2000ms (Ultra-Polite)</option>
                  <option value={2500}>🐢 2500ms (Relaxed)</option>
                  <option value={3000}>🧘 3000ms (Super Safe)</option>
                </select>
                <button
                  type="button"
                  className="scraper-btn btn-save-key"
                  onClick={handleUpdateScraperKey}
                  disabled={isScraperActionLoading}
                >
                  💾 Save Delay
                </button>
              </div>
            </div>
          </div>

          {/* Metric KPIs */}
          <div className="scraper-kpi-grid">
            <div className="scraper-kpi-card">
              <span className="kpi-icon">💊</span>
              <div className="kpi-info">
                <span className="kpi-label">Total Medicines in DB</span>
                <span className="kpi-val">{(scraperStatus.stats?.totalMedicines || 15188).toLocaleString()}</span>
              </div>
            </div>

            <div className="scraper-kpi-card kpi-card-blue">
              <span className="kpi-icon">⚡</span>
              <div className="kpi-info">
                <span className="kpi-label">Total Processed</span>
                <span className="kpi-val">{(scraperStatus.stats?.totalProcessed || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="scraper-kpi-card kpi-card-green">
              <span className="kpi-icon">🎯</span>
              <div className="kpi-info">
                <span className="kpi-label">100% Live Enriched</span>
                <span className="kpi-val">{(scraperStatus.stats?.totalEnriched || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="scraper-kpi-card kpi-card-amber">
              <span className="kpi-icon">🛡️</span>
              <div className="kpi-info">
                <span className="kpi-label">Formulation Fallbacks</span>
                <span className="kpi-val">{(scraperStatus.stats?.totalFallback || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="scraper-kpi-card kpi-card-purple">
              <span className="kpi-icon">⏳</span>
              <div className="kpi-info">
                <span className="kpi-label">Remaining to Refill</span>
                <span className="kpi-val">{(scraperStatus.stats?.pendingRefill || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="scraper-kpi-card kpi-card-teal">
              <span className="kpi-icon">📈</span>
              <div className="kpi-info">
                <span className="kpi-label">Progress</span>
                <span className="kpi-val">{scraperStatus.stats?.percentCompleted || 0}%</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="scraper-progress-card">
            <div className="scraper-progress-header">
              <span>Overall Database Refill Completion</span>
              <span><strong>{scraperStatus.stats?.percentCompleted || 0}%</strong> Completed</span>
            </div>
            <div className="scraper-progress-track">
              <div
                className="scraper-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0.5, scraperStatus.stats?.percentCompleted || 0))}%` }}
              ></div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="scraper-card scraper-controls-card">
            <div className="scraper-controls-left">
              {!scraperStatus.isRunning ? (
                <button
                  type="button"
                  className="scraper-action-btn btn-start-refill"
                  onClick={handleStartScraper}
                  disabled={isScraperActionLoading}
                >
                  ▶️ Start Direct Free Refill (Unlimited)
                </button>
              ) : (
                <button
                  type="button"
                  className="scraper-action-btn btn-stop-refill"
                  onClick={handleStopScraper}
                  disabled={isScraperActionLoading}
                >
                  ⏸️ Pause / Stop Refill
                </button>
              )}

              <button
                type="button"
                className="scraper-action-btn btn-step-refill"
                onClick={() => handleEnrichBatch(5)}
                disabled={isScraperActionLoading || scraperStatus.isRunning}
              >
                ⚡ Test Next 5 Medicines (Direct Free)
              </button>

              <button
                type="button"
                className="scraper-action-btn btn-refresh-refill"
                onClick={fetchScraperStatus}
              >
                🔄 Refresh Stats
              </button>
            </div>

            <div className="scraper-controls-right">
              <button
                type="button"
                className="scraper-action-btn btn-rewind-refill"
                onClick={handleResetScraperCheckpoint}
                disabled={scraperStatus.isRunning}
                title="Rewind checkpoint to specific ID"
              >
                ⏮️ Rewind Checkpoint
              </button>
            </div>
          </div>

          {/* Live Feed / Last Processed Medicine Details Card */}
          {scraperStatus.checkpoint?.lastItem && (
            <div className="scraper-card scraper-live-card">
              <div className="scraper-live-header">
                <div className="scraper-live-title">
                  <span className="live-pulse-dot"></span>
                  <h4>Active Refilled Item: <strong>{scraperStatus.checkpoint.lastItem.name}</strong></h4>
                  <span className={`scraper-source-tag ${scraperStatus.checkpoint.lastItem.liveEnriched ? "tag-live" : "tag-fallback"}`}>
                    {scraperStatus.checkpoint.lastItem.liveEnriched ? "🟢 100% Live 1mg Extracted" : "🛡️ Smart Medical Template Fallback"}
                  </span>
                </div>
                {scraperStatus.checkpoint.lastItem.product_url && (
                  <a
                    href={scraperStatus.checkpoint.lastItem.product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="scraper-source-link"
                  >
                    🔗 View on 1mg ↗
                  </a>
                )}
              </div>

              <div className="scraper-extracted-grid">
                <div className="extracted-box">
                  <div className="extracted-header">📋 Product Introduction / Description</div>
                  <div className="extracted-content">
                    {scraperStatus.checkpoint.lastItem.description || "No description available"}
                  </div>
                </div>

                <div className="extracted-box">
                  <div className="extracted-header">🎯 Uses of Medicine</div>
                  <div className="extracted-content text-green">
                    {scraperStatus.checkpoint.lastItem.uses || "No uses available"}
                  </div>
                </div>

                <div className="extracted-box">
                  <div className="extracted-header">⚠️ Side Effects</div>
                  <div className="extracted-content text-amber">
                    {scraperStatus.checkpoint.lastItem.side_effects || "No side effects available"}
                  </div>
                </div>

                <div className="extracted-box">
                  <div className="extracted-header">💊 How to Use / Dosage (कसा वापरावा)</div>
                  <div className="extracted-content text-blue">
                    {scraperStatus.checkpoint.lastItem.dosage || "No dosage instructions available"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent 5 Enriched Items from MySQL Table */}
          {Array.isArray(scraperStatus.recentEnriched) && scraperStatus.recentEnriched.length > 0 && (
            <div className="scraper-card scraper-history-card">
              <div className="scraper-card-title-row">
                <h4>📊 Recent Refilled Medicines (Direct from Hostinger MySQL)</h4>
                <span className="history-subtitle">Confirmed saved in database: `zepmed_medicines`</span>
              </div>

              <div className="scraper-history-table-wrap">
                <table className="scraper-history-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Medicine Name</th>
                      <th>Live Uses</th>
                      <th>Live Side Effects</th>
                      <th>How to Use / Dosage</th>
                      <th>Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scraperStatus.recentEnriched.map((med) => (
                      <tr key={med.id}>
                        <td><strong>#{med.id}</strong></td>
                        <td>
                          <div className="med-history-name">{med.product_name}</div>
                          {med.product_url && (
                            <a href={med.product_url} target="_blank" rel="noreferrer" className="med-history-link">1mg link ↗</a>
                          )}
                        </td>
                        <td><div className="med-truncate-cell text-green">{med.uses}</div></td>
                        <td><div className="med-truncate-cell text-amber">{med.side_effects}</div></td>
                        <td><div className="med-truncate-cell text-blue">{med.dosage}</div></td>
                        <td><span className="timestamp-badge">{med.updated_at ? new Date(med.updated_at).toLocaleTimeString() : "Just now"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Guarantee Footer Notice */}
          <div className="scraper-guarantee-notice">
            <span className="notice-icon">🔒</span>
            <div>
              <strong>कायमस्वरूपी सेव्ह गॅरंटी (Zero Data Loss Guarantee):</strong> 
              {" "}आधी पूर्ण झालेले सर्व <strong>{(scraperStatus.stats?.totalProcessed || 504).toLocaleString()}</strong> प्रॉडक्ट्स डेटाबेसमध्ये सुरक्षित आहेत. आता 'Direct Free Mode' मध्ये कोणतेही क्रेडिट्स न लागता प्रक्रिया थेट <strong>Row #{scraperStatus.checkpoint?.lastProcessedId || 3080}</strong> च्या पुढे अखंड चालू राहील. पुन्हा 1 पासून सुरू होणार नाही!
            </div>
          </div>
        </div>
      ) : (
          /* SECTION B: PRODUCT CATALOG (MEDICINE OR BLINKIT) */
          <>
            {/* Quick Shortcut Banner for Direct 1mg Free Refill in Medicine View */}
            {activeSection === "medicine" && (
              <div className="scraper-shortcut-banner direct-free-banner">
                <div className="sm-shortcut-content">
                  <div className="sm-shortcut-icon">⚡</div>
                  <div>
                    <h4>Direct 1mg Free Refill Engine (Zero Credits / Unlimited)</h4>
                    <p>
                      100% Free direct refill from Tata 1mg into Hostinger MySQL without ScraperAPI or ZenRows credits. 
                      <strong> {(scraperStatus.stats?.totalProcessed || 504).toLocaleString()}</strong> done • <strong>{(scraperStatus.stats?.pendingRefill || 0).toLocaleString()}</strong> pending refill.
                    </p>
                  </div>
                </div>
                <div className="sm-shortcut-actions">
                  {scraperStatus.isRunning ? (
                    <span className="sm-badge-active">🟢 Worker Running (Row #{scraperStatus.checkpoint?.lastProcessedId || 3080})</span>
                  ) : (
                    <span className="sm-badge-idle">⏸️ Worker Paused</span>
                  )}
                  <button type="button" className="sm-shortcut-btn" onClick={() => handleSectionSwitch("scraper")}>
                    Open Direct Free Dashboard ➔
                  </button>
                </div>
              </div>
            )}
            {/* A-Z INDIAN MEDICINES 2.5L+ BATCH GENERATOR HUD WITH CIRCULAR PROGRESS RING */}
            {activeSection === "medicine" && (
              <div className={`batch-hud-card ${isBatchGenerating ? "running-glow" : ""}`}>
                <div className="batch-hud-header">
                  <div className="batch-hud-title-wrap">
                    <div className="batch-hud-badge">
                      <span className="live-dot-pulse"></span> 2,53,973 A-Z MEDICINES ENGINE
                    </div>
                    <h3 className="batch-hud-title">
                      🚀 Continuous Batch Auto-Generator & Scraper
                    </h3>
                    <p className="batch-hud-sub">
                      Aggregates 15 medicines per batch via Apify Tata 1mg Actor + DB Cache. Auto-resumes from last saved checkpoint row.
                    </p>
                  </div>

                  <div className="batch-hud-actions">
                    <button
                      type="button"
                      className={`batch-engine-toggle-btn ${isBatchGenerating ? "stop-btn" : "start-btn"}`}
                      onClick={toggleBatchGenerator}
                    >
                      {isBatchGenerating ? (
                        <>⏹️ Stop Engine (Batch #{batchStatus.currentBatchIndex})</>
                      ) : (
                        <>▶️ Start Batch Auto-Generator (Row {batchStatus.currentRowIndex.toLocaleString()})</>
                      )}
                    </button>

                    <button
                      type="button"
                      className="batch-reset-checkpoint-btn"
                      onClick={handleResetCheckpoint}
                      title="Reset checkpoint to Row 0"
                    >
                      🔄 Reset Row 0
                    </button>

                    <button
                      type="button"
                      className="batch-collapse-toggle-btn"
                      onClick={() => setShowBatchDashboard((s) => !s)}
                      title={showBatchDashboard ? "Collapse details" : "Expand details"}
                    >
                      {showBatchDashboard ? "🔼 Collapse HUD" : "🔽 Expand HUD"}
                    </button>
                  </div>
                </div>

                {showBatchDashboard && (
                  <div className="batch-hud-body">
                    {/* Left: Circular Progress Ring */}
                    <div className="batch-ring-wrapper">
                      <div className="batch-ring-svg-container">
                        <svg width="130" height="130" viewBox="0 0 130 130" className="batch-circle-svg">
                          <defs>
                            <linearGradient id="ringGradNeon" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#00f2fe" />
                              <stop offset="50%" stopColor="#4facfe" />
                              <stop offset="100%" stopColor="#10b981" />
                            </linearGradient>
                          </defs>
                          {/* Background Track */}
                          <circle
                            cx="65"
                            cy="65"
                            r="50"
                            className="ring-bg-track"
                            strokeWidth="10"
                          />
                          {/* Animated Progress Ring */}
                          <circle
                            cx="65"
                            cy="65"
                            r="50"
                            className="ring-progress-bar"
                            strokeWidth="10"
                            stroke="url(#ringGradNeon)"
                            strokeDasharray={314.16}
                            strokeDashoffset={314.16 - (Math.min(100, Math.max(0, batchStatus.percentCompleted)) / 100) * 314.16}
                            strokeLinecap="round"
                          />
                          {/* Center Metrics */}
                          <text x="65" y="58" textAnchor="middle" className="ring-center-pct">
                            {batchStatus.percentCompleted}%
                          </text>
                          <text x="65" y="78" textAnchor="middle" className="ring-center-sub">
                            Batch #{batchStatus.currentBatchIndex.toLocaleString()}
                          </text>
                        </svg>
                      </div>
                      <div className="ring-status-label">
                        {isBatchGenerating ? "⚡ Streaming Live Batches..." : "⏸️ Paused at Checkpoint"}
                      </div>
                    </div>

                    {/* Center: Live KPI Telemetry Cards */}
                    <div className="batch-telemetry-grid">
                      {/* Card 1: Row Progress */}
                      <div className="telemetry-card">
                        <div className="telemetry-lbl">📦 Dataset Checkpoint</div>
                        <div className="telemetry-val">
                          {batchStatus.currentRowIndex.toLocaleString()}
                          <span className="telemetry-denom"> / 2,53,973</span>
                        </div>
                        <div className="telemetry-bar-wrap">
                          <div
                            className="telemetry-bar-fill"
                            style={{ width: `${Math.min(100, Math.max(0, batchStatus.percentCompleted))}%` }}
                          ></div>
                        </div>
                        <div className="telemetry-foot">
                          Auto-saved in <code>dataset_checkpoint.json</code> (Never starts from 0 on restart)
                        </div>
                      </div>

                      {/* Card 2: Batch Speed & Efficiency */}
                      <div className="telemetry-card">
                        <div className="telemetry-lbl">⚡ Live Batch Speed</div>
                        <div className="telemetry-val" style={{ color: "#38bdf8" }}>
                          {batchStatus.lastSpeedMs ? `${(batchStatus.lastSpeedMs / 1000).toFixed(1)}s` : "~8.0s"}
                          <span className="telemetry-denom"> / 10 meds (High-Efficiency Batch)</span>
                        </div>
                        <div className="telemetry-tag-row">
                          <span className="telemetry-pill success">💰 90% Apify Credit Saved</span>
                          <span className="telemetry-pill">dzTaO7bhlAGsNXfCA</span>
                        </div>
                        <div className="telemetry-foot">
                          Batched in single Apify run — charges ~0.003 USD instead of 0.05 USD!
                        </div>
                      </div>

                      {/* Card 3: Hostinger MySQL Live Count */}
                      <div className="telemetry-card">
                        <div className="telemetry-lbl">💾 Hostinger MySQL Stored</div>
                        <div className="telemetry-val" style={{ color: "#34d399" }}>
                          {storedMedicineIds.size.toLocaleString()}
                          <span className="telemetry-denom"> Medicines</span>
                        </div>
                        <div className="telemetry-tag-row">
                          <span className="telemetry-pill success">🟢 28 Columns Verified</span>
                          <span className="telemetry-pill">Unique PID Deduped</span>
                        </div>
                        <div className="telemetry-foot">
                          Direct remote persistence in <code>zepmed_medicines</code> (82.25.121.184)
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bottom: Live Medicine Stream Chips */}
                {batchStatus.lastBatchMeds && batchStatus.lastBatchMeds.length > 0 && (
                  <div className="batch-live-stream-bar">
                    <span className="live-stream-title">🔥 Current Batch Active Medicines ({batchStatus.lastBatchMeds.length}):</span>
                    <div className="batch-chips-wrap">
                      {batchStatus.lastBatchMeds.map((med, mIdx) => (
                        <span key={mIdx} className="batch-med-chip" title={med}>
                          💊 {med}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* BLINKIT 27,555 PRODUCTS BATCH GENERATOR HUD WITH CIRCULAR PROGRESS RING */}
            {activeSection === "blinkit" && (
              <div className={`batch-hud-card blinkit-theme ${isBlinkitBatchGenerating ? "running-glow" : ""}`}>
                <div className="batch-hud-header">
                  <div className="batch-hud-title-wrap">
                    <div className="batch-hud-badge blinkit-badge">
                      <span className="live-dot-pulse blinkit-pulse"></span> 27,555 BLINKIT CATALOG ENGINE
                    </div>
                    <h3 className="batch-hud-title">
                      🚀 Blinkit Continuous Batch Auto-Generator & Deduplicator
                    </h3>
                    <p className="batch-hud-sub">
                      Processes 50 authentic products per batch from Blinkit Catalog into 28 Columns with calculated discounts & direct Blinkit URLs. Zero external toll, ultra-fast 0.2s batch execution.
                    </p>
                  </div>

                  <div className="batch-hud-actions">
                    <button
                      type="button"
                      className={`batch-engine-toggle-btn ${isBlinkitBatchGenerating ? "stop-btn" : "start-btn"}`}
                      onClick={toggleBlinkitBatchGenerator}
                    >
                      {isBlinkitBatchGenerating ? (
                        <>⏹️ Stop Engine (Batch #{blinkitBatchStatus.currentBatchIndex})</>
                      ) : (
                        <>▶️ Start Blinkit Auto-Generator (Row {blinkitBatchStatus.currentRowIndex.toLocaleString()})</>
                      )}
                    </button>

                    <button
                      type="button"
                      className="batch-reset-checkpoint-btn"
                      onClick={handleResetBlinkitCheckpoint}
                      title="Reset checkpoint to Row 0"
                    >
                      🔄 Reset Row 0
                    </button>

                    <button
                      type="button"
                      className="batch-collapse-toggle-btn"
                      onClick={() => setShowBlinkitBatchDashboard((s) => !s)}
                      title={showBlinkitBatchDashboard ? "Collapse details" : "Expand details"}
                    >
                      {showBlinkitBatchDashboard ? "🔼 Collapse HUD" : "🔽 Expand HUD"}
                    </button>
                  </div>
                </div>

                {showBlinkitBatchDashboard && (
                  <div className="batch-hud-body">
                    {/* Left: Circular Progress Ring */}
                    <div className="batch-ring-wrapper">
                      <div className="batch-ring-svg-container">
                        <svg width="130" height="130" viewBox="0 0 130 130" className="batch-circle-svg">
                          <defs>
                            <linearGradient id="blinkitRingGradNeon" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#f59e0b" />
                              <stop offset="50%" stopColor="#eab308" />
                              <stop offset="100%" stopColor="#10b981" />
                            </linearGradient>
                          </defs>
                          {/* Background Track */}
                          <circle
                            cx="65"
                            cy="65"
                            r="50"
                            className="ring-bg-track"
                            strokeWidth="10"
                          />
                          {/* Animated Progress Ring */}
                          <circle
                            cx="65"
                            cy="65"
                            r="50"
                            className="ring-progress-bar"
                            strokeWidth="10"
                            stroke="url(#blinkitRingGradNeon)"
                            strokeDasharray={314.16}
                            strokeDashoffset={314.16 - (Math.min(100, Math.max(0, blinkitBatchStatus.percentCompleted)) / 100) * 314.16}
                            strokeLinecap="round"
                          />
                          {/* Center Metrics */}
                          <text x="65" y="58" textAnchor="middle" className="ring-center-pct">
                            {blinkitBatchStatus.percentCompleted}%
                          </text>
                          <text x="65" y="78" textAnchor="middle" className="ring-center-sub">
                            Batch #{blinkitBatchStatus.currentBatchIndex.toLocaleString()}
                          </text>
                        </svg>
                      </div>
                      <div className="ring-status-label">
                        {isBlinkitBatchGenerating ? "⚡ Streaming Live Blinkit Batches..." : "⏸️ Paused at Checkpoint"}
                      </div>
                    </div>

                    {/* Center: Live KPI Telemetry Cards */}
                    <div className="batch-telemetry-grid">
                      {/* Card 1: Row Progress */}
                      <div className="telemetry-card">
                        <div className="telemetry-lbl">📦 Blinkit Dataset Checkpoint</div>
                        <div className="telemetry-val">
                          {blinkitBatchStatus.currentRowIndex.toLocaleString()}
                          <span className="telemetry-denom"> / 27,555</span>
                        </div>
                        <div className="telemetry-bar-wrap">
                          <div
                            className="telemetry-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, blinkitBatchStatus.percentCompleted))}%`,
                              background: "linear-gradient(90deg, #f59e0b, #10b981)",
                            }}
                          ></div>
                        </div>
                        <div className="telemetry-foot">
                          Auto-saved in <code>blinkit_checkpoint.json</code> (Never starts from 0 on restart)
                        </div>
                      </div>

                      {/* Card 2: Batch Speed & Efficiency */}
                      <div className="telemetry-card">
                        <div className="telemetry-lbl">⚡ Live Batch Speed</div>
                        <div className="telemetry-val" style={{ color: "#fbbf24" }}>
                          {blinkitBatchStatus.lastSpeedMs ? `${blinkitBatchStatus.lastSpeedMs}ms` : "~250ms"}
                          <span className="telemetry-denom"> / 10 items (Smart Batch Ingestion + Recommendations)</span>
                        </div>
                        <div className="telemetry-tag-row">
                          <span className="telemetry-pill success">💰 100% Free Processing</span>
                          <span className="telemetry-pill">⚡ 10 Items + Recommendations / Batch</span>
                        </div>
                        <div className="telemetry-foot">
                          Zero external network toll — charges $0.00 and saves directly to Hostinger DB!
                        </div>
                      </div>

                      {/* Card 3: Hostinger MySQL Live Count */}
                      <div className="telemetry-card">
                        <div className="telemetry-lbl">💾 Hostinger MySQL Stored</div>
                        <div className="telemetry-val" style={{ color: "#34d399" }}>
                          {(blinkitBatchStatus.totalInDb || dbStatus.blinkitCount || storedBlinkitIds.size || 0).toLocaleString()}
                          <span className="telemetry-denom"> Products</span>
                        </div>
                        <div className="telemetry-tag-row">
                          <span className="telemetry-pill success">🟢 28 Columns Verified</span>
                          <span className="telemetry-pill">Unique PID Deduped</span>
                        </div>
                        <div className="telemetry-foot">
                          Direct remote persistence in <code>zepmed_blinkit_products</code> (82.25.121.184)
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bottom: Last Processed Product */}
                {blinkitBatchStatus.lastProductName && (
                  <div className="batch-live-stream-bar">
                    <span className="live-stream-title">🛒 Last Processed Item:</span>
                    <span className="batch-med-chip" title={blinkitBatchStatus.lastProductName}>
                      ⚡ {blinkitBatchStatus.lastProductName}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="section-header">
              <div className="section-title-wrap">
                <h2>
                  {activeSection === "medicine"
                    ? "💊 Tata 1mg Genuine Indian Medicines"
                    : activeSection === "blinkit"
                    ? "⚡ Blinkit Quick-Commerce Groceries"
                    : "🌿 Tata 1mg Genuine OTC Healthcare Products"}
                </h2>
                <p>
                  {activeSection === "medicine"
                    ? "Live authentic pharmaceutical catalog mapped into 28 Enterprise Columns with direct store verification links."
                    : activeSection === "blinkit"
                    ? "Live quick-commerce catalog mapped into 28 Enterprise Columns with direct store verification links."
                    : "Live authentic Tata 1mg Over-The-Counter healthcare catalog mapped into 28 Enterprise Columns."}
                </p>
              </div>

              {/* View Switcher */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="view-toggle-group">
                  <button
                    className={`view-toggle-btn ${viewMode === "cards" ? "active" : ""}`}
                    onClick={() => setViewMode("cards")}
                  >
                    🗂️ Detailed Boxes (28-Col)
                  </button>
                  <button
                    className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
                    onClick={() => setViewMode("table")}
                  >
                    📊 Complete 28-Column Table
                  </button>
                </div>

                <span style={{ fontSize: "13px", fontWeight: 700, background: "white", padding: "6px 14px", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
                  Showing {totalItems > 0 ? startIndex + 1 : 0}-{endIndex} of {totalItems.toLocaleString()} Products
                </span>
              </div>
            </div>

            {renderPaginationBar("top")}

            {/* EMPTY STATE WITH INSTANT SINGLE PRODUCT GENERATION */}
            {filteredProducts.length === 0 ? (
              <div className="empty-search-state">
                <div className="empty-icon">🔍</div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                  '{searchQuery}' साठी थेट मॅच सापडला नाही
                </h3>
                <p style={{ color: "#64748b", marginTop: "6px", fontSize: "13px" }}>
                  तुम्ही या नावाचा अस्सल सिंगल प्रॉडक्ट लगेच २८ कॉलम्ससह तयार करून डिस्प्ले करू शकता:
                </p>
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "16px", flexWrap: "wrap" }}>
                  <button
                    className="add-single-product-btn"
                    onClick={() => handleAddCustomProduct(searchQuery)}
                  >
                    ⚡ Add & Display '{searchQuery}' as Single Product (28-Col)
                  </button>
                  <button
                    className="export-btn"
                    style={{ background: "#64748b" }}
                    onClick={() => setSearchQuery("")}
                  >
                    सर्व प्रॉडक्ट्स दाखवा
                  </button>
                </div>
              </div>
            ) : viewMode === "cards" ? (
              /* VIEW MODE 1: RICH 28-ATTRIBUTE CARDS WITH DIRECT LIVE URL & COPY BUTTONS */
              <div className="product-grid">
                {displayedProducts.map((prod) => {
                  const isSavedInDb = currentStoredIds.has(prod.product_id);
                  const cardUid = prod.product_id;

                  return (
                    <div key={prod.product_id} className="product-card">
                      {/* Image Box */}
                      <div
                        className="card-image-box"
                        onClick={() => setSelectedProduct(prod)}
                        title="Click to view full 28 attributes modal"
                      >
                        <img
                          src={prod.image_url}
                          alt={prod.product_name}
                          className="product-img"
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = getCategoryFallbackImage(prod);
                          }}
                        />
                        <span
                          className="badge-tag"
                          style={{
                            background:
                              activeSection === "medicine"
                                ? "#dc2626"
                                : activeSection === "blinkit"
                                ? "#0c831f"
                                : "#0d9488",
                          }}
                        >
                          {prod.category}
                        </span>

                        {isSavedInDb && (
                          <span className="db-status-badge">
                            ✓ Saved in DB
                          </span>
                        )}

                        <div className="img-hover-overlay">
                          <span>🔍 View Details</span>
                        </div>
                      </div>

                      {/* Card Content with ALL 28 Attributes */}
                      <div className="card-data-box">
                        {/* Brand & Pack Row with Copy buttons */}
                        <div className="brand-row">
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              className="brand-name"
                              style={{
                                background:
                                  activeSection === "medicine"
                                    ? "#fee2e2"
                                    : activeSection === "blinkit"
                                    ? "#e8f7ed"
                                    : "#ccfbf1",
                                color:
                                  activeSection === "medicine"
                                    ? "#dc2626"
                                    : activeSection === "blinkit"
                                    ? "#0c831f"
                                    : "#0d9488",
                              }}
                            >
                              Brand: {prod.brand}
                            </span>
                            <CopyBtn val={prod.brand} label="Brand" uid={`${cardUid}-brand`} />
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span className="pack-quantity">{prod.unit}</span>
                            <CopyBtn val={prod.unit} label="Unit" uid={`${cardUid}-unit`} />
                          </div>
                        </div>

                        {/* Title with Copy */}
                        <div className="title-row-with-copy">
                          <h3
                            className="product-title"
                            onClick={() => setSelectedProduct(prod)}
                            title="Click to view full specs"
                          >
                            {prod.product_name}
                          </h3>
                          <CopyBtn val={prod.product_name} label="Product Name" uid={`${cardUid}-name`} />
                        </div>

                        {/* All 28 Attributes Display Box with Copy for Every Item */}
                        <div className="all-attributes-box">
                          <div className="attr-row">
                            <span className="attr-key">Product ID:</span>
                            <span className="attr-val mono">{prod.product_id}</span>
                            <CopyBtn val={prod.product_id} label="Product ID" uid={`${cardUid}-pid`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Category ID:</span>
                            <span className="attr-val">{prod.category_id} ({prod.category})</span>
                            <CopyBtn val={prod.category_id} label="Category ID" uid={`${cardUid}-catid`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Sub Category:</span>
                            <span className="attr-val highlight-val">{prod.sub_category}</span>
                            <CopyBtn val={prod.sub_category} label="Sub Category" uid={`${cardUid}-subcat`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Composition:</span>
                            <span className="attr-val semibold-val">{prod.composition}</span>
                            <CopyBtn val={prod.composition} label="Composition" uid={`${cardUid}-comp`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Generic Salt:</span>
                            <span className="attr-val">{prod.generic_salt}</span>
                            <CopyBtn val={prod.generic_salt} label="Generic Salt" uid={`${cardUid}-salt`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Packaging:</span>
                            <span className="attr-val">{prod.units_per_pack} Units/Pack | {prod.packs_per_box} Packs/Box</span>
                            <CopyBtn val={`${prod.units_per_pack} Units/Pack, ${prod.packs_per_box} Packs/Box`} label="Packaging" uid={`${cardUid}-pkg`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Manufacturer:</span>
                            <span className="attr-val">{prod.manufacturer}</span>
                            <CopyBtn val={prod.manufacturer} label="Manufacturer" uid={`${cardUid}-mfg`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Prescription:</span>
                            <span
                              className="attr-val"
                              style={{
                                color: prod.prescription_required === "Yes" ? "#dc2626" : "#0c831f",
                                fontWeight: 800
                              }}
                            >
                              {prod.prescription_required === "Yes" ? "Yes (Rx Required)" : "No (OTC)"}
                            </span>
                            <CopyBtn val={prod.prescription_required} label="Prescription Required" uid={`${cardUid}-rx`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Uses:</span>
                            <span className="attr-val uses-val">{prod.uses}</span>
                            <CopyBtn val={prod.uses} label="Uses" uid={`${cardUid}-uses`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Side Effects:</span>
                            <span className="attr-val side-fx-val">{prod.side_effects}</span>
                            <CopyBtn val={prod.side_effects} label="Side Effects" uid={`${cardUid}-sidefx`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Dosage:</span>
                            <span className="attr-val">{prod.dosage}</span>
                            <CopyBtn val={prod.dosage} label="Dosage" uid={`${cardUid}-dosage`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Health Tags:</span>
                            <span className="attr-val tags-val">{prod.health_tags}</span>
                            <CopyBtn val={prod.health_tags} label="Health Tags" uid={`${cardUid}-tags`} />
                          </div>

                          <div className="attr-row">
                            <span className="attr-key">Status:</span>
                            <span className="attr-val status-val">
                              Active: {prod.active} | Visible: {prod.customer_visible} | {prod.approval_status}
                            </span>
                            <CopyBtn val={`Active: ${prod.active}, Visible: ${prod.customer_visible}, ${prod.approval_status}`} label="Status" uid={`${cardUid}-status`} />
                          </div>
                        </div>

                        {/* Description Box with Copy */}
                        <div className="desc-text-wrapper">
                          <div className="desc-text" title={prod.description}>
                            <strong>Description:</strong> {prod.description}
                          </div>
                          <CopyBtn val={prod.description} label="Description" uid={`${cardUid}-desc`} />
                        </div>

                        {/* ======================================================== */}
                        {/* 🌐 DIRECT LIVE PRODUCT URL BOX (RIGHT ABOVE THE MRP!) */}
                        {/* ======================================================== */}
                        <div className="live-url-card-box">
                          <div className="live-url-top">
                            <div className="live-url-label-wrap">
                              <span className="live-url-pulse">●</span>
                              <span className="live-url-heading">
                                {activeSection === "medicine" ? "Tata 1mg Live URL" : activeSection === "blinkit" ? "Blinkit Live URL" : "Tata 1mg OTC Live URL"}
                              </span>
                            </div>
                            <CopyBtn val={prod.product_url} label="Live Product URL" uid={`${cardUid}-url`} />
                          </div>

                          <div className="live-url-anchor-wrap">
                            <a
                              href={prod.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="live-store-link"
                              onClick={(e) => e.stopPropagation()}
                              title={`Open live product page: ${prod.product_url}`}
                            >
                              <span className="live-link-icon">🔗</span>
                              <span className="live-link-text">{prod.product_url}</span>
                              <span className="live-link-open-pill">↗ Open Live</span>
                            </a>
                          </div>
                        </div>

                        {/* Pricing & Database Actions (Right below the URL!) */}
                        <div className="store-controls">
                          <div className="price-inputs-row">
                            <div className="price-col">
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <span className="price-lbl">MRP</span>
                                <CopyBtn val={prod.mrp} label="MRP" uid={`${cardUid}-mrp`} />
                              </div>
                              <span className="price-mrp-val">₹{prod.mrp}</span>
                            </div>

                            <div className="price-col">
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <span className="price-lbl">Discount</span>
                                <CopyBtn val={prod.discount_pct} label="Discount" uid={`${cardUid}-disc`} />
                              </div>
                              <span className="price-disc-val">{prod.discount_pct} OFF</span>
                            </div>

                            <div className="price-col text-right">
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                                <span className="price-lbl">Selling Price</span>
                                <CopyBtn val={prod.selling_price} label="Selling Price" uid={`${cardUid}-sp`} />
                              </div>
                              <span
                                className="price-sp-val"
                                style={{
                                  color: activeSection === "medicine" ? "#dc2626" : activeSection === "blinkit" ? "#0c831f" : "#0d9488"
                                }}
                              >
                                ₹{prod.selling_price}
                              </span>
                            </div>
                          </div>

                          <div className="card-action-row">
                            <button
                              className={`btn-card-db ${isSavedInDb ? "saved" : ""}`}
                              onClick={() => handleStoreInDatabase(prod)}
                            >
                              {isSavedInDb ? "✓ Stored in DB" : "💾 Store in DB"}
                            </button>

                            <button
                              className="btn-card-view-modal"
                              onClick={() => setSelectedProduct(prod)}
                              title="Open complete structured dialog"
                            >
                              🔍 View 28 Columns
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* VIEW MODE 2: COMPLETE 28-COLUMN SPREADSHEET TABLE */
              <div className="table-wrapper-13">
                <table className="full-table-13">
                  <thead>
                    <tr>
                      <th>Product ID</th>
                      <th>Image</th>
                      <th>Product Name</th>
                      <th>Live Store URL (Direct Link)</th>
                      <th>Category ID</th>
                      <th>Category</th>
                      <th>Sub Category</th>
                      <th>Brand</th>
                      <th>MRP</th>
                      <th>Selling Price</th>
                      <th>Discount %</th>
                      <th>Allow Discount</th>
                      <th>Unit</th>
                      <th>Units/Pack</th>
                      <th>Packs/Box</th>
                      <th>Composition</th>
                      <th>Generic Salt</th>
                      <th>Manufacturer</th>
                      <th>Uses</th>
                      <th>Side Effects</th>
                      <th>Dosage</th>
                      <th>Health Tags</th>
                      <th>Prescription</th>
                      <th>Customer Visible</th>
                      <th>Active</th>
                      <th>Approval Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedProducts.map((prod) => {
                      const isSaved = currentStoredIds.has(prod.product_id);
                      const tblUid = `tbl-${prod.product_id}`;

                      return (
                        <tr key={prod.product_id}>
                          <td style={{ fontFamily: "monospace", fontWeight: 700 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              {prod.product_id}
                              <CopyBtn val={prod.product_id} label="Product ID" uid={`${tblUid}-pid`} />
                            </div>
                          </td>
                          <td>
                            <img
                              src={prod.image_url}
                              alt=""
                              className="table-thumb"
                              loading="lazy"
                              onError={(e) => {
                                e.target.src = getCategoryFallbackImage(prod);
                              }}
                              onClick={() => setSelectedProduct(prod)}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td style={{ fontWeight: 700, minWidth: "160px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span onClick={() => setSelectedProduct(prod)} style={{ cursor: "pointer", color: "#0f172a" }}>
                                {prod.product_name}
                              </span>
                              <CopyBtn val={prod.product_name} label="Product Name" uid={`${tblUid}-name`} />
                            </div>
                          </td>
                          {/* Live URL Column in Table */}
                          <td style={{ minWidth: "220px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <a
                                href={prod.product_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="table-url-link"
                                title={prod.product_url}
                              >
                                🔗 Open Live Link ↗
                              </a>
                              <CopyBtn val={prod.product_url} label="Product URL" uid={`${tblUid}-url`} />
                            </div>
                          </td>
                          <td>{prod.category_id}</td>
                          <td>{prod.category}</td>
                          <td style={{ color: activeSection === "medicine" ? "#0284c7" : activeSection === "blinkit" ? "#0c831f" : "#0d9488", fontWeight: 600 }}>{prod.sub_category}</td>
                          <td style={{ fontWeight: 700 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              {prod.brand}
                              <CopyBtn val={prod.brand} label="Brand" uid={`${tblUid}-brand`} />
                            </div>
                          </td>
                          <td>₹{prod.mrp}</td>
                          <td style={{ fontWeight: 800, color: activeSection === "medicine" ? "#dc2626" : activeSection === "blinkit" ? "#0c831f" : "#0d9488" }}>₹{prod.selling_price}</td>
                          <td>{prod.discount_pct}</td>
                          <td>{prod.allow_discount}</td>
                          <td>{prod.unit}</td>
                          <td>{prod.units_per_pack}</td>
                          <td>{prod.packs_per_box}</td>
                          <td style={{ minWidth: "140px" }}>{prod.composition}</td>
                          <td>{prod.generic_salt}</td>
                          <td style={{ minWidth: "130px" }}>{prod.manufacturer}</td>
                          <td style={{ color: "#166534", minWidth: "140px" }}>{prod.uses}</td>
                          <td style={{ color: "#b45309", minWidth: "130px" }}>{prod.side_effects}</td>
                          <td>{prod.dosage}</td>
                          <td style={{ fontSize: "11px", minWidth: "120px" }}>{prod.health_tags}</td>
                          <td style={{ fontWeight: 700, color: prod.prescription_required === "Yes" ? "#dc2626" : "#0c831f" }}>
                            {prod.prescription_required}
                          </td>
                          <td>{prod.customer_visible}</td>
                          <td>{prod.active}</td>
                          <td>{prod.approval_status}</td>
                          <td>
                            <button
                              className={`btn-card-db ${isSaved ? "saved" : ""}`}
                              style={{ padding: "6px 10px", fontSize: "11px", whiteSpace: "nowrap" }}
                              onClick={() => handleStoreInDatabase(prod)}
                            >
                              {isSaved ? "✓ In DB" : "💾 Save"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {renderPaginationBar("bottom")}
          </>
        )}
      </main>

      {/* 4. LOGIN MODAL FOR PRODUCT ANALYSIS */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="login-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="login-icon-circle">🔐</div>
            <h2>ZepMed Product Analysis Access</h2>
            <p>Enter official administrator credentials to access 28-column intelligence.</p>

            {loginError && (
              <div style={{ background: "#fee2e2", color: "#dc2626", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", marginBottom: "14px", fontWeight: 600 }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit}>
              <div className="login-input-group">
                <label>Login Email / Admin ID</label>
                <input
                  type="email"
                  className="login-input"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="DB@Zepmed.com"
                  required
                />
              </div>

              <div className="login-input-group">
                <label>Password</label>
                <input
                  type="password"
                  className="login-input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter admin password (Zepmed@7030)"
                  required
                />
              </div>

              <button type="submit" className="login-submit-btn">
                🔓 Unlock Product Analysis
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. GORGEOUS & STRUCTURED 28-COLUMN PRODUCT DETAIL MODAL (CLICK ON IMAGE) */}
      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="product-detail-modal" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-dialog-header">
              <div className="modal-header-info">
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                  <span
                    className="modal-badge-cat"
                    style={{
                      background: activeSection === "medicine" ? "#dc2626" : activeSection === "blinkit" ? "#0c831f" : "#0d9488",
                    }}
                  >
                    {selectedProduct.category}
                  </span>
                  <span className="modal-badge-brand">Brand: {selectedProduct.brand}</span>
                  <span className="modal-badge-id">ID: {selectedProduct.product_id}</span>
                  {selectedProduct.prescription_required === "Yes" && (
                    <span className="modal-badge-rx">Rx Required</span>
                  )}
                </div>
                <h2 className="modal-product-title">{selectedProduct.product_name}</h2>
              </div>

              <button className="modal-close-round-btn" onClick={() => setSelectedProduct(null)}>
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-dialog-body">
              {/* Left Column: Image & Direct Actions */}
              <div className="modal-body-left">
                <div className="modal-image-container">
                  <img
                    src={selectedProduct.image_url}
                    alt={selectedProduct.product_name}
                    className="modal-large-img"
                    onError={(e) => {
                      e.target.src =
                        activeSection === "medicine" || activeSection === "otc"
                          ? "https://onemg.gumlet.io/l_watermark_346,w_480,h_480/a_ignore,w_480,h_480,c_fit,q_auto,f_auto/cropped/buhk7yptjggz25hwwgqj.jpg"
                          : "https://cdn.grofers.com/da/cms-assets/cms/product/e72a84c6-2f18-486c-969d-c8c9fe7651cf.png";
                    }}
                  />
                </div>

                {/* Direct Live URL Action Button */}
                <a
                  href={selectedProduct.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modal-open-live-btn"
                  title="Verify authentic listing on source platform"
                >
                  <span>🌐 Open Live Product Page ↗</span>
                </a>

                {/* Database Save Button in Modal */}
                <button
                  className="modal-store-db-btn"
                  onClick={() => {
                    handleStoreInDatabase(selectedProduct);
                    setSelectedProduct(null);
                  }}
                >
                  💾 Store (All 28 Attributes) in MySQL DB
                </button>

                {/* Quick Visual Status Details */}
                <div className="modal-status-box">
                  <div className="status-row-item">
                    <span>Approval:</span>
                    <strong>{selectedProduct.approval_status}</strong>
                  </div>
                  <div className="status-row-item">
                    <span>Customer Visible:</span>
                    <strong>{selectedProduct.customer_visible}</strong>
                  </div>
                  <div className="status-row-item">
                    <span>Active Status:</span>
                    <strong>{selectedProduct.active}</strong>
                  </div>
                  <div className="status-row-item">
                    <span>Image Status:</span>
                    <strong>{selectedProduct.image_status}</strong>
                  </div>
                </div>
              </div>

              {/* Right Column: Complete 28 Columns Categorized with Copy Buttons */}
              <div className="modal-body-right">
                {/* 1. Live Verification Link Card */}
                <div className="modal-spec-card highlight-card">
                  <div className="spec-card-header">
                    <h4>🔗 Verified Live Product URL</h4>
                    <CopyBtn val={selectedProduct.product_url} label="Live Product URL" uid="modal-url" />
                  </div>
                  <a
                    href={selectedProduct.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="modal-live-link"
                  >
                    {selectedProduct.product_url}
                  </a>
                </div>

                {/* 2. Commercial Pricing & Pack Grid */}
                <div className="modal-spec-card">
                  <div className="spec-card-header">
                    <h4>💰 Commercial & Pricing Breakdown</h4>
                  </div>
                  <div className="modal-grid-specs">
                    <div className="spec-item">
                      <span className="spec-k">MRP</span>
                      <div className="spec-v-wrap">
                        <span className="spec-v-mrp">₹{selectedProduct.mrp}</span>
                        <CopyBtn val={selectedProduct.mrp} label="MRP" uid="modal-mrp" />
                      </div>
                    </div>

                    <div className="spec-item">
                      <span className="spec-k">Selling Price</span>
                      <div className="spec-v-wrap">
                        <span className="spec-v-sp">₹{selectedProduct.selling_price}</span>
                        <CopyBtn val={selectedProduct.selling_price} label="Selling Price" uid="modal-sp" />
                      </div>
                    </div>

                    <div className="spec-item">
                      <span className="spec-k">Discount %</span>
                      <div className="spec-v-wrap">
                        <span className="spec-v-disc">{selectedProduct.discount_pct} (Allow: {selectedProduct.allow_discount})</span>
                        <CopyBtn val={selectedProduct.discount_pct} label="Discount %" uid="modal-disc" />
                      </div>
                    </div>

                    <div className="spec-item">
                      <span className="spec-k">Unit / Pack Form</span>
                      <div className="spec-v-wrap">
                        <span className="spec-v">{selectedProduct.unit}</span>
                        <CopyBtn val={selectedProduct.unit} label="Unit" uid="modal-unit" />
                      </div>
                    </div>

                    <div className="spec-item">
                      <span className="spec-k">Units Per Pack</span>
                      <div className="spec-v-wrap">
                        <span className="spec-v">{selectedProduct.units_per_pack} Units</span>
                        <CopyBtn val={selectedProduct.units_per_pack} label="Units Per Pack" uid="modal-upp" />
                      </div>
                    </div>

                    <div className="spec-item">
                      <span className="spec-k">Packs Per Box</span>
                      <div className="spec-v-wrap">
                        <span className="spec-v">{selectedProduct.packs_per_box} Packs</span>
                        <CopyBtn val={selectedProduct.packs_per_box} label="Packs Per Box" uid="modal-ppb" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Scientific Formulation & Manufacturer */}
                <div className="modal-spec-card">
                  <div className="spec-card-header">
                    <h4>🧪 Chemical Formulation & Manufacturer</h4>
                  </div>
                  <div className="spec-list-rows">
                    <div className="spec-row">
                      <span className="spec-label">Composition:</span>
                      <span className="spec-value font-bold">{selectedProduct.composition}</span>
                      <CopyBtn val={selectedProduct.composition} label="Composition" uid="modal-comp" />
                    </div>

                    <div className="spec-row">
                      <span className="spec-label">Generic Salt:</span>
                      <span className="spec-value">{selectedProduct.generic_salt}</span>
                      <CopyBtn val={selectedProduct.generic_salt} label="Generic Salt" uid="modal-salt" />
                    </div>

                    <div className="spec-row">
                      <span className="spec-label">Manufacturer:</span>
                      <span className="spec-value">{selectedProduct.manufacturer}</span>
                      <CopyBtn val={selectedProduct.manufacturer} label="Manufacturer" uid="modal-mfg" />
                    </div>

                    <div className="spec-row">
                      <span className="spec-label">Sub Category:</span>
                      <span className="spec-value">{selectedProduct.sub_category}</span>
                      <CopyBtn val={selectedProduct.sub_category} label="Sub Category" uid="modal-subcat" />
                    </div>
                  </div>
                </div>

                {/* 4. Clinical Uses, Side Effects & Dosage */}
                <div className="modal-spec-card clinical-card">
                  <div className="spec-card-header">
                    <h4>⚕️ Clinical Indications, Usage & Safety</h4>
                  </div>

                  <div className="clinical-block uses">
                    <div className="clinical-header">
                      <strong>💡 Uses & Indications:</strong>
                      <CopyBtn val={selectedProduct.uses} label="Uses" uid="modal-uses" />
                    </div>
                    <p>{selectedProduct.uses}</p>
                  </div>

                  <div className="clinical-block side-effects">
                    <div className="clinical-header">
                      <strong>⚠️ Known Side Effects:</strong>
                      <CopyBtn val={selectedProduct.side_effects} label="Side Effects" uid="modal-sidefx" />
                    </div>
                    <p>{selectedProduct.side_effects}</p>
                  </div>

                  <div className="clinical-block dosage">
                    <div className="clinical-header">
                      <strong>📋 Recommended Dosage:</strong>
                      <CopyBtn val={selectedProduct.dosage} label="Dosage" uid="modal-dosage" />
                    </div>
                    <p>{selectedProduct.dosage}</p>
                  </div>

                  <div className="clinical-block tags">
                    <div className="clinical-header">
                      <strong>🏷️ Regulatory & Health Certification Tags:</strong>
                      <CopyBtn val={selectedProduct.health_tags} label="Health Tags" uid="modal-htags" />
                    </div>
                    <p>{selectedProduct.health_tags}</p>
                  </div>
                </div>

                {/* 5. Complete Description */}
                <div className="modal-spec-card">
                  <div className="spec-card-header">
                    <h4>📝 Full Product Description</h4>
                    <CopyBtn val={selectedProduct.description} label="Description" uid="modal-desc" />
                  </div>
                  <p className="modal-desc-para">{selectedProduct.description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
