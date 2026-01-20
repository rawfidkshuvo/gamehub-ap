import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc, // New: For audit logs
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  LayoutDashboard,
  Gamepad2,
  Settings,
  LogOut,
  BarChart3,
  List,
  Hammer,
  Save,
  Search,
  Users,
  Smartphone,
  Menu,
  X,
  Download,
  Terminal,
  Megaphone,
  CheckSquare,
  Square,
  AlertTriangle,
  Eye,
  Sparkles,
  Flame,
  Clock, // Used for Heatmap header
  Crown,
  Lock,
  Shield, // New: Security Icon
  Globe,  // New: Map Icon
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { scaleLinear } from "d3-scale";

// --- STATIC GAME DATA ---
const KNOWN_GAMES = [
  { id: 1, title: "Conspiracy" },
  { id: 2, title: "Investigation" },
  { id: 3, title: "Police Hunt" },
  { id: 4, title: "Emperor" },
  { id: 5, title: "Pirates" },
  { id: 6, title: "Fruit Seller" },
  { id: 7, title: "Ghost Dice" },
  { id: 8, title: "Protocol: Sabotage" },
  { id: 10, title: "Neon Draft" },
  { id: 12, title: "Contraband" },
  { id: 15, title: "Guild of Shadows" },
  { id: 17, title: "Masquerade Protocol" },
  { id: 18, title: "Paper Oceans" },
  { id: 19, title: "Royal Menagerie" },
  { id: 20, title: "Fructose Fury" },
  { id: 21, title: "Angry Virus" },
  { id: 22, title: "Last of Us" },
  { id: 23, title: "Together" },
  { id: 24, title: "Spectrum" },
];

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "game-hub-ff8aa.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: "game-hub-ff8aa.firebasestorage.app",
  messagingSenderId: "586559578902",
  appId: "1:586559578902:web:91da4fa4ace038d16aa637"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#3b82f6",
  "#8b5cf6",
];

const AdminPanel = () => {
  // Auth State
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI State
  const [activeView, setActiveView] = useState("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [dateRange, setDateRange] = useState("7"); // Default 7 Days

  // Data State
  const [gamesConfig, setGamesConfig] = useState({});
  const [gameStats, setGameStats] = useState({});
  const [activityLogs, setActivityLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]); // New: Audit Logs
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemMessage, setSystemMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Bulk Action State
  const [selectedGames, setSelectedGames] = useState(new Set());

  // --- AUTH ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && u.email === "admin@rawfidsgamehub.com") setUser(u);
      else setUser(null);
    });
    return () => unsub();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // --- AUDIT LOGGER ---
  const logAdminAction = async (action, details) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "admin_audit_logs"), {
        timestamp: new Date(),
        adminEmail: user.email,
        action: action,
        details: details,
      });
    } catch (err) {
      console.error("Failed to log action", err);
    }
  };

  // --- DATA SYNC ---
  useEffect(() => {
    if (!user) return;

    // 1. Config
    const unsubConfig = onSnapshot(
      doc(db, "game_hub_settings", "config"),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setMaintenanceMode(data.maintenanceMode || false);
          setSystemMessage(data.systemMessage || "");
          const { maintenanceMode, systemMessage, ...games } = data;
          setGamesConfig(games);
        }
      }
    );

    // 2. Stats (All-Time Data)
    const unsubStats = onSnapshot(collection(db, "game_stats"), (snap) => {
      const stats = {};
      snap.docs.forEach(
        (d) => (stats[parseInt(d.id.replace("game_", ""))] = d.data().clicks || 0)
      );
      setGameStats(stats);
    });

    // 3. Logs (Dynamic Limit based on Timeframe)
    // Adjust limit so charts have enough data for 1Y vs 24H
    let logLimit = 500;
    const days = parseInt(dateRange);
    if (days > 1) logLimit = 2000;
    if (days > 30) logLimit = 5000;
    if (days > 100) logLimit = 8000;

    const q = query(
      collection(db, "game_click_logs"),
      orderBy("timestamp", "desc"),
      limit(logLimit)
    );
    const unsubLogs = onSnapshot(q, (snap) => {
      setActivityLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 4. Audit Logs (New)
    const auditQ = query(
      collection(db, "admin_audit_logs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const unsubAudit = onSnapshot(auditQ, (snap) => {
      setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubConfig();
      unsubStats();
      unsubLogs();
      unsubAudit();
    };
  }, [user, dateRange]); // Re-run when dateRange changes

  // --- ACTIONS ---
  const saveChanges = async () => {
    try {
      await setDoc(doc(db, "game_hub_settings", "config"), {
        ...gamesConfig,
        maintenanceMode,
        systemMessage,
      });
      await logAdminAction("System Update", "Saved global config changes");
      alert("System Updated Successfully!");
    } catch (err) {
      alert("Save failed: " + err.message);
    }
  };

  const handleGameToggle = (id, field) => {
    const gameTitle = gamesConfig[id]?.title || `ID ${id}`;
    setGamesConfig((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: !prev[id]?.[field] },
    }));
    logAdminAction("Game Toggle", `Toggled ${field} for ${gameTitle}`);
  };

  const exportCSV = () => {
    const headers = ["Time,Game,Category,Device,Location,User ID"];
    const rows = activityLogs.map((log) => {
      const time = log.timestamp
        ? new Date(log.timestamp.seconds * 1000).toISOString()
        : "";
      const loc = log.country ? `${log.city}-${log.country}` : "Unknown";
      return `${time},"${log.gameTitle}","${log.category}","${log.device}","${loc}","${log.userId}"`;
    });
    const csvContent =
      "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "gamehub_activity_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- BULK ACTIONS LOGIC ---
  const filteredGameList = KNOWN_GAMES.filter(
    (g) =>
      g.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.id.toString().includes(searchTerm)
  );

  const toggleSelectAll = () => {
    if (selectedGames.size > 0) setSelectedGames(new Set());
    else {
      setSelectedGames(new Set(filteredGameList.map((g) => g.id)));
    }
  };

  const isBulkActive = (field) => {
    const selectedIds = Array.from(selectedGames);
    if (selectedIds.length === 0) return false;
    return selectedIds.every((id) => {
      const game = gamesConfig[id] || {};
      if (field === "visible") return game.visible !== false;
      return !!game[field];
    });
  };

  const toggleBulkProperty = (field) => {
    const newConfig = { ...gamesConfig };
    const selectedIds = Array.from(selectedGames);
    const currentlyActive = isBulkActive(field);
    const targetValue = !currentlyActive;

    selectedIds.forEach((id) => {
      if (!newConfig[id]) newConfig[id] = {};
      newConfig[id][field] = targetValue;
    });

    setGamesConfig(newConfig);
    logAdminAction("Bulk Update", `Set ${field} to ${targetValue} for ${selectedIds.length} games`);
  };

  // --- COMPUTED DATA FOR CHARTS ---
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - parseInt(dateRange));

    return activityLogs.filter((log) => {
      if (!log.timestamp) return false;
      const logDate = new Date(log.timestamp.seconds * 1000);
      return logDate >= cutoff;
    });
  }, [activityLogs, dateRange]);

  const chartData = useMemo(() => {
    const dateCount = {};
    const categoryCount = {};
    const recentGameCount = {}; 

    // 1. Process Logs (Timeline, Categories, Recent Games)
    filteredLogs
      .slice()
      .reverse()
      .forEach((log) => {
        // Date
        const date = new Date(log.timestamp.seconds * 1000).toLocaleDateString(
          undefined,
          { month: "short", day: "numeric" }
        );
        dateCount[date] = (dateCount[date] || 0) + 1;

        // Category
        const cat = log.category || "Other";
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;

        // Recent Game (from Logs)
        const gameTitle = log.gameTitle || "Unknown";
        recentGameCount[gameTitle] = (recentGameCount[gameTitle] || 0) + 1;
      });

    // 2. Process Game Stats (Total Organic Clicks - All Time)
    const organicData = KNOWN_GAMES.map((game) => ({
      name: game.title,
      value: gameStats[game.id] || 0,
    }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    // 3. Process Recent Games (Top 5)
    const recentGamesData = Object.keys(recentGameCount)
      .map((k) => ({ name: k, value: recentGameCount[k] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      timeline: Object.keys(dateCount).map((k) => ({
        date: k,
        clicks: dateCount[k],
      })),
      categories: Object.keys(categoryCount).map((k) => ({
        name: k,
        value: categoryCount[k],
      })),
      recentGames: recentGamesData,
      organic: organicData,
    };
  }, [filteredLogs, gameStats]);

  // --- LOGIN SCREEN ---
  if (!user)
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="text-center mb-8">
            <div className="inline-flex p-4 bg-slate-800 rounded-full mb-4 shadow-inner">
              <Lock className="w-8 h-8 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              ADMIN PORTAL
            </h1>
            <p className="text-slate-500 text-sm font-medium">
              Restricted Access Area
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:border-indigo-500 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:border-indigo-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-indigo-500/20">
              Secure Login
            </button>
          </form>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col md:flex-row overflow-hidden">
      {/* SIDEBAR */}
      <aside
        className={`fixed md:relative z-50 w-72 h-full bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ${
          isMobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <div className="flex items-center gap-2 font-black text-xl text-white">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Settings className="text-white w-5 h-5" />
            </div>
            GAME<span className="text-indigo-500">ADMIN</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <SidebarItem
            icon={<LayoutDashboard size={18} />}
            label="Overview"
            active={activeView === "dashboard"}
            onClick={() => setActiveView("dashboard")}
          />
          <SidebarItem
            icon={<Gamepad2 size={18} />}
            label="Game Manager"
            active={activeView === "games"}
            onClick={() => setActiveView("games")}
          />
          <SidebarItem
            icon={<Shield size={18} />}
            label="Audit Logs"
            active={activeView === "security"}
            onClick={() => setActiveView("security")}
          />

          <div className="mt-8">
            <div className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Terminal size={12} /> Live Feed
            </div>
            <div className="mx-2 bg-slate-950 rounded-lg border border-slate-800 p-3 h-48 overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-slate-950 to-transparent z-10" />
              <div className="space-y-3 text-xs font-mono">
                {activityLogs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="animate-in slide-in-from-left-2 fade-in duration-500"
                  >
                    <span className="text-emerald-500">➜</span>{" "}
                    <span className="text-slate-300">{log.gameTitle}</span>
                    <div className="text-slate-600 text-[10px] pl-4">
                      {log.timestamp
                        ? new Date(
                            log.timestamp.seconds * 1000
                          ).toLocaleTimeString()
                        : "Just now"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-slate-950 to-transparent z-10" />
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <button
            onClick={() => signOut(auth)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-red-900/20 hover:text-red-400 rounded-lg transition-colors text-sm font-bold border border-slate-700 hover:border-red-900/50"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden text-slate-400"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {activeView === "dashboard" ? (
                <LayoutDashboard className="text-indigo-500" size={20} />
              ) : activeView === "games" ? (
                <Gamepad2 className="text-indigo-500" size={20} />
              ) : (
                <Shield className="text-indigo-500" size={20} />
              )}
              <span className="capitalize">{activeView}</span>
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                maintenanceMode
                  ? "bg-orange-900/20 border-orange-500/50 text-orange-400"
                  : "bg-emerald-900/20 border-emerald-500/50 text-emerald-400"
              }`}
            >
              {maintenanceMode ? (
                <Hammer size={12} />
              ) : (
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {maintenanceMode ? "System Maintenance" : "System Online"}
            </div>
            <button
              onClick={saveChanges}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-900/20"
            >
              <Save size={16} />{" "}
              <span className="hidden sm:inline">Save Changes</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          {/* --- DASHBOARD VIEW --- */}
          {activeView === "dashboard" && (
            <div className="space-y-6 max-w-7xl mx-auto pb-20">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col md:flex-row items-center gap-4 shadow-lg">
                <div className="p-3 bg-indigo-500/20 rounded-lg text-indigo-400">
                  <Megaphone size={24} />
                </div>
                <div className="flex-1 w-full">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                    Global System Announcement
                  </label>
                  <input
                    type="text"
                    placeholder="E.g. 'Servers will restart at midnight' (Leave empty to hide)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 outline-none text-sm placeholder-slate-600"
                    value={systemMessage}
                    onChange={(e) => setSystemMessage(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 border-b border-slate-800 pb-4">
                <h3 className="text-slate-400 font-bold text-sm uppercase flex items-center gap-2">
                  <BarChart3 size={16} /> Performance Metrics
                </h3>
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 overflow-x-auto max-w-full">
                  {[
                    { label: "24H", value: "1" },
                    { label: "7D", value: "7" },
                    { label: "30D", value: "30" },
                    { label: "3M", value: "90" },
                    { label: "6M", value: "180" },
                    { label: "9M", value: "270" },
                    { label: "1Y", value: "365" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDateRange(opt.value)}
                      className={`px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                        dateRange === opt.value
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                          : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  label="Total Interactions"
                  value={filteredLogs.length}
                  icon={<List className="text-blue-400" />}
                  subtext="In selected period"
                />
                <StatCard
                  label="Unique Players"
                  value={new Set(filteredLogs.map((l) => l.userId)).size}
                  icon={<Users className="text-emerald-400" />}
                  subtext="Estimated count"
                />
                <StatCard
                  label="Mobile Usage"
                  value={`${Math.round(
                    (filteredLogs.filter(
                      (l) =>
                        l.deviceType === "Mobile" ||
                        (l.device && l.device.toLowerCase().includes("mobile"))
                    ).length /
                      (filteredLogs.length || 1)) *
                      100
                  )}%`}
                  icon={<Smartphone className="text-pink-400" />}
                  subtext="Device ratio"
                />
              </div>

              {/* 2x2 Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
                {/* 1. TIMELINE */}
                <ChartCard title="Click Timeline">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.timeline}>
                      <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#f8fafc" }} 
                        itemStyle={{ color: "#f8fafc" }}
                        cursor={{ fill: "#1e293b" }} 
                      />
                      <Bar dataKey="clicks" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 2. CATEGORY DISTRIBUTION */}
                <ChartCard title="Category Distribution">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={chartData.categories} 
                        dataKey="value" 
                        innerRadius={60} 
                        outerRadius={80} 
                        paddingAngle={5}
                      >
                        {chartData.categories.map((entry, index) => (
                          <Cell key={`cell-cat-${index}`} fill={COLORS[index % COLORS.length]} stroke="#0f172a" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                        itemStyle={{ color: "#e2e8f0" }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 3. RECENT TOP 5 */}
                <ChartCard title="Top 5 Games (Selected Period)">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={chartData.recentGames} 
                        dataKey="value" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={60} 
                        outerRadius={80} 
                        paddingAngle={5}
                      >
                        {chartData.recentGames.map((entry, index) => (
                          <Cell key={`cell-recent-${index}`} fill={COLORS[(COLORS.length - 1 - index) % COLORS.length]} stroke="#0f172a" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                        itemStyle={{ color: "#e2e8f0" }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 4. TOTAL ORGANIC CLICKS */}
                <ChartCard title="Total Organic Clicks (All Time)">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={chartData.organic} 
                        dataKey="value" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={60} 
                        outerRadius={80} 
                        paddingAngle={5}
                      >
                        {chartData.organic.map((entry, index) => (
                          <Cell key={`cell-org-${index}`} fill={COLORS[(index + 3) % COLORS.length]} stroke="#0f172a" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                        itemStyle={{ color: "#e2e8f0" }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* --- NEW VISUALIZATION SECTION --- */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
                {/* 1. World Map (Takes up 2 columns) */}
                <div className="xl:col-span-2 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg h-96 flex flex-col">
                  <h3 className="text-slate-400 text-xs uppercase font-bold mb-4 flex items-center gap-2 px-2">
                    <Globe size={14} /> Global Traffic Map
                  </h3>
                  <div className="flex-1 rounded-lg border border-slate-800 overflow-hidden relative">
                    <WorldMapWidget data={filteredLogs} />
                  </div>
                </div>

                {/* 2. Heatmap (Takes up 1 column) */}
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg h-96 flex flex-col">
                  <h3 className="text-slate-400 text-xs uppercase font-bold mb-4 flex items-center gap-2 px-2">
                    <Clock size={14} /> Peak Activity Heatmap
                  </h3>
                  <div className="flex-1">
                    <UsageHeatmap data={filteredLogs} />
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                  <div className="font-bold text-white flex items-center gap-2">
                    <List size={16} className="text-indigo-500" /> Recent Activity Log
                  </div>
                  <button
                    onClick={exportCSV}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors flex items-center gap-2"
                  >
                    <Download size={12} /> Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">Game</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3">Platform</th>
                        <th className="px-4 py-3 text-right">User Hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {activityLogs.slice(0, 50).map((log) => (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">
                            {log.timestamp
                              ? new Date(
                                  log.timestamp.seconds * 1000
                                ).toLocaleString()
                              : "-"}
                          </td>
                          <td className="px-4 py-3 font-medium text-white">
                            {log.gameTitle}
                          </td>
                          <td className="px-4 py-3 text-slate-300 text-xs">
                            {log.country ? (
                              <span className="flex items-center gap-1">
                                {log.city && (
                                  <span className="text-slate-500">
                                    {log.city},
                                  </span>
                                )}
                                <span className="font-semibold text-indigo-400">
                                  {log.country}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-600 italic">
                                Unknown
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {log.os ? (
                              <span className="flex flex-col">
                                <span className="text-white">{log.os}</span>
                                <span className="text-[10px] text-slate-600">
                                  {log.deviceType}
                                </span>
                              </span>
                            ) : (
                              <span>{log.device?.split("(")[0] || "Web"}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-slate-600">
                            {log.userId === "unknown"
                              ? "Guest"
                              : log.userId?.substring(0, 8)}
                            ...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- GAME MANAGER VIEW --- */}
          {activeView === "games" && (
            <div className="space-y-6 max-w-7xl mx-auto pb-20">
              {/* TOOLBAR */}
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg min-h-[80px]">
                {selectedGames.size > 0 ? (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-2">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-2 flex justify-between items-center">
                      <span>{selectedGames.size} Games Selected</span>
                      <button
                        onClick={() => setSelectedGames(new Set())}
                        className="text-slate-500 hover:text-white"
                      >
                        Clear Selection
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <BulkActionButton
                        active={isBulkActive("visible")}
                        onClick={() => toggleBulkProperty("visible")}
                        label="Visible"
                        icon={<Eye size={14} />}
                        color="bg-indigo-600 border-indigo-500"
                        text="text-indigo-100"
                      />
                      <BulkActionButton
                        active={isBulkActive("isFeatured")}
                        onClick={() => toggleBulkProperty("isFeatured")}
                        label="Featured"
                        icon={<Crown size={14} />}
                        color="bg-emerald-600 border-emerald-500"
                        text="text-emerald-100"
                      />
                      <BulkActionButton
                        active={isBulkActive("isNew")}
                        onClick={() => toggleBulkProperty("isNew")}
                        label="New"
                        icon={<Sparkles size={14} />}
                        color="bg-red-600 border-red-500"
                        text="text-red-100"
                      />
                      <BulkActionButton
                        active={isBulkActive("isHot")}
                        onClick={() => toggleBulkProperty("isHot")}
                        label="Hot"
                        icon={<Flame size={14} />}
                        color="bg-orange-600 border-orange-500"
                        text="text-orange-100"
                      />
                      <BulkActionButton
                        active={isBulkActive("isUpcoming")}
                        onClick={() => toggleBulkProperty("isUpcoming")}
                        label="Upcoming"
                        icon={<Clock size={14} />}
                        color="bg-pink-600 border-pink-500"
                        text="text-pink-100"
                      />
                      <BulkActionButton
                        active={isBulkActive("maintenance")}
                        onClick={() => toggleBulkProperty("maintenance")}
                        label="Maintenance"
                        icon={<Hammer size={14} />}
                        color="bg-red-700 border-red-500"
                        text="text-red-100"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative w-full xl:w-80">
                      <Search
                        className="absolute left-3 top-3 text-slate-500"
                        size={18}
                      />
                      <input
                        type="text"
                        placeholder="Search ID or Name..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-white focus:border-indigo-500 outline-none text-sm transition-colors"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
                      <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                        <AlertTriangle size={12} className="text-red-500" />{" "}
                        Emergency:
                      </span>
                      <button
                        onClick={() => {
                          setMaintenanceMode(!maintenanceMode);
                          logAdminAction("Emergency", `Toggled Maintenance Mode to ${!maintenanceMode}`);
                        }}
                        className={`w-12 h-6 rounded-full p-1 transition-colors ${
                          maintenanceMode
                            ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                            : "bg-slate-800"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 bg-white rounded-full transition-transform ${
                            maintenanceMode ? "translate-x-6" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-xs font-bold tracking-wider">
                      <tr>
                        <th className="p-4 w-10">
                          <button
                            onClick={toggleSelectAll}
                            className="text-slate-500 hover:text-white"
                          >
                            {selectedGames.size > 0 ? (
                              <CheckSquare size={18} />
                            ) : (
                              <Square size={18} />
                            )}
                          </button>
                        </th>
                        <th className="p-4">ID</th>
                        <th className="p-4">Game Name</th>
                        <th className="p-4 text-center">Visible</th>
                        <th className="p-4 text-center text-emerald-400">
                          Featured
                        </th>
                        <th className="p-4 text-center text-red-400">New</th>
                        <th className="p-4 text-center text-orange-400">Hot</th>
                        <th className="p-4 text-center text-pink-400">
                          Upcoming
                        </th>
                        <th className="p-4 text-center text-red-500 font-extrabold">
                          Maintenance
                        </th>
                        <th className="p-4 text-center">Stats</th>
                        <th className="p-4 text-center">Boost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredGameList.map((game) => {
                        const id = game.id;
                        const config = gamesConfig[id] || {};
                        const real = gameStats[id] || 0;
                        const boost = config.popularity || 0;
                        const isSelected = selectedGames.has(id);

                        return (
                          <tr
                            key={id}
                            className={`transition-colors ${
                              isSelected
                                ? "bg-indigo-900/20"
                                : "hover:bg-slate-800/30"
                            }`}
                          >
                            <td className="p-4">
                              <button
                                onClick={() => {
                                  const newSet = new Set(selectedGames);
                                  if (newSet.has(id)) newSet.delete(id);
                                  else newSet.add(id);
                                  setSelectedGames(newSet);
                                }}
                                className={
                                  isSelected
                                    ? "text-indigo-400"
                                    : "text-slate-600"
                                }
                              >
                                {isSelected ? (
                                  <CheckSquare size={18} />
                                ) : (
                                  <Square size={18} />
                                )}
                              </button>
                            </td>
                            <td className="p-4 font-mono text-slate-500 text-xs">
                              #{id}
                            </td>
                            <td className="p-4 font-bold text-white text-sm">
                              {game.title}
                            </td>
                            <td className="p-4 text-center">
                              <Toggle
                                checked={config.visible ?? true}
                                onChange={(v) =>
                                  handleGameToggle(id, "visible")
                                }
                                color="bg-indigo-500"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <input
                                type="radio"
                                name="featured"
                                checked={config.isFeatured || false}
                                onChange={() => {
                                  const newConfig = { ...gamesConfig };
                                  Object.keys(newConfig).forEach(
                                    (k) =>
                                      (newConfig[k] = {
                                        ...newConfig[k],
                                        isFeatured: false,
                                      })
                                  );
                                  newConfig[id] = {
                                    ...newConfig[id],
                                    isFeatured: true,
                                  };
                                  setGamesConfig(newConfig);
                                  logAdminAction("Featured", `Set ${game.title} as Featured`);
                                }}
                                className="accent-emerald-500 w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Checkbox
                                checked={config.isNew}
                                onChange={(v) => handleGameToggle(id, "isNew")}
                                colorClass="bg-red-500 border-red-500"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Checkbox
                                checked={config.isHot}
                                onChange={(v) => handleGameToggle(id, "isHot")}
                                colorClass="bg-orange-500 border-orange-500"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Checkbox
                                checked={config.isUpcoming}
                                onChange={(v) =>
                                  handleGameToggle(id, "isUpcoming")
                                }
                                colorClass="bg-pink-500 border-pink-500"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <Checkbox
                                checked={config.maintenance}
                                onChange={(v) =>
                                  handleGameToggle(id, "maintenance")
                                }
                                colorClass="bg-red-500 border-red-500"
                              />
                            </td>
                            <td className="p-4 text-center">
                              <div className="text-xs font-mono text-slate-400">
                                {real} clicks
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <input
                                type="number"
                                value={boost}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setGamesConfig((prev) => ({
                                    ...prev,
                                    [id]: { ...prev[id], popularity: val },
                                  }));
                                }}
                                className="w-16 bg-slate-950 border border-slate-700 rounded text-center text-sm py-1 focus:border-indigo-500 outline-none text-white"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- AUDIT LOGS VIEW (NEW) --- */}
          {activeView === "security" && (
            <div className="space-y-6 max-w-7xl mx-auto pb-20">
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Shield size={16} className="text-indigo-500" /> Admin Audit Trail
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Timestamp</th>
                        <th className="px-6 py-3">Admin</th>
                        <th className="px-6 py-3">Action</th>
                        <th className="px-6 py-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/30">
                          <td className="px-6 py-4 text-slate-400 font-mono text-xs whitespace-nowrap">
                            {log.timestamp?.seconds 
                              ? new Date(log.timestamp.seconds * 1000).toLocaleString() 
                              : "Pending..."}
                          </td>
                          <td className="px-6 py-4 text-white font-medium">
                            {log.adminEmail}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              log.action.includes("Toggle") 
                                ? "bg-blue-900/30 text-blue-400 border border-blue-800"
                                : "bg-purple-900/30 text-purple-400 border border-purple-800"
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-400 text-xs">
                            {log.details}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {auditLogs.length === 0 && (
                    <div className="p-8 text-center text-slate-500 italic">
                      No admin actions recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// --- SUB-COMPONENTS ---

const SidebarItem = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
      active
        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    }`}
  >
    {icon} {label}
  </button>
);

const BulkActionButton = ({ active, onClick, label, icon, color, text }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${
      active
        ? `${color} ${text} shadow-md`
        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
    }`}
  >
    {icon} {label} {active && <span className="ml-1 opacity-60">ON</span>}
  </button>
);

const StatCard = ({ label, value, icon, subtext }) => (
  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-colors">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
          {label}
        </p>
        <h3 className="text-3xl font-black text-white">{value}</h3>
        {subtext && <p className="text-slate-600 text-xs mt-1">{subtext}</p>}
      </div>
      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 group-hover:scale-110 transition-transform">
        {icon}
      </div>
    </div>
  </div>
);

const ChartCard = ({ title, children }) => (
  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl h-80 flex flex-col shadow-lg">
    <h3 className="text-slate-400 text-xs uppercase font-bold mb-4 flex items-center gap-2 px-2">
      <BarChart3 size={14} /> {title}
    </h3>
    <div className="flex-1 min-h-0">{children}</div>
  </div>
);

const Toggle = ({ checked, onChange, color }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
      checked ? color : "bg-slate-700"
    }`}
  >
    <div
      className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

const Checkbox = ({ checked, onChange, colorClass }) => (
  <div
    onClick={() => onChange(!checked)}
    className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors mx-auto ${
      checked
        ? colorClass
        : "bg-slate-950 border-slate-700 hover:border-slate-500"
    }`}
  >
    {checked && <CheckSquare size={14} className="text-white" />}
  </div>
);

const WorldMapWidget = ({ data }) => {
  const countryData = useMemo(() => {
    const counts = {};
    data.forEach((log) => {
      const country = log.country || "Unknown";
      counts[country] = (counts[country] || 0) + 1;
    });
    return counts;
  }, [data]);

  const colorScale = scaleLinear()
    .domain([0, Math.max(...Object.values(countryData), 1)])
    .range(["#1e293b", "#6366f1"]); 

  return (
    <div className="w-full h-full bg-slate-950 rounded-xl overflow-hidden relative">
      <ComposableMap
        projectionConfig={{ scale: 140 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup>
          <Geographies geography="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json">
            {({ geographies }) =>
              geographies.map((geo) => {
                const countryName = geo.properties.name;
                const clicks = countryData[countryName] || 0;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={clicks > 0 ? colorScale(clicks) : "#334155"}
                    stroke="#0f172a"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: { fill: "#f472b6", outline: "none", cursor: "pointer" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      <div className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur p-3 rounded-lg border border-slate-800 text-xs text-slate-300 pointer-events-none">
        <div className="font-bold text-white mb-1">Top Regions</div>
        {Object.entries(countryData)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([name, count]) => (
            <div key={name} className="flex justify-between gap-4">
              <span>{name}</span>
              <span className="text-indigo-400">{count}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

const UsageHeatmap = ({ data }) => {
  const heatmap = useMemo(() => {
    const grid = Array(7).fill(0).map(() => Array(24).fill(0));
    let max = 0;
    data.forEach(log => {
      const d = new Date(log.timestamp.seconds * 1000);
      const day = d.getDay();
      const hour = d.getHours();
      grid[day][hour]++;
      if (grid[day][hour] > max) max = grid[day][hour];
    });
    return { grid, max };
  }, [data]);

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex flex-col h-full overflow-x-auto">
      <div className="flex">
        <div className="w-10 shrink-0"></div>
        <div className="flex-1 grid grid-cols-24 mb-2">
          {Array(24).fill(0).map((_, i) => (
            <div key={i} className="text-[9px] text-slate-500 text-center border-l border-slate-800/50">
              {i % 3 === 0 ? i : ""}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-between">
        {heatmap.grid.map((row, dayIdx) => (
          <div key={dayIdx} className="flex items-center h-8">
            <div className="w-10 shrink-0 text-[10px] text-slate-400 font-bold">{days[dayIdx]}</div>
            <div className="flex-1 grid grid-cols-24 gap-[2px] h-full">
              {row.map((val, hourIdx) => (
                <div
                  key={hourIdx}
                  className="rounded-sm transition-all hover:ring-1 ring-white/50 relative group"
                  style={{
                    backgroundColor: val > 0 ? `rgba(99, 102, 241, ${Math.max(0.15, val / (heatmap.max || 1))})` : '#1e293b'
                  }}
                >
                  {val > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-900 text-white text-[10px] px-2 py-1 rounded border border-slate-700 whitespace-nowrap z-50">
                      {val} clicks at {hourIdx}:00
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPanel;