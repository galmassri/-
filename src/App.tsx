import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Users, 
  Ticket, 
  Settings, 
  LayoutDashboard, 
  Plus, 
  Search, 
  RefreshCw, 
  Router,
  LogOut,
  UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, loginWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { Voucher, Profile, Reseller, RouterConfig, VoucherStatus } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  
  // Data state
  const [routers, setRouters] = useState<RouterConfig[]>([]);
  const [selectedRouter, setSelectedRouter] = useState<RouterConfig | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [usermanUsers, setUsermanUsers] = useState<any[]>([]);
  const [routerResources, setRouterResources] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch Routers
    const qRouters = query(collection(db, 'routers'));
    const unsubRouters = onSnapshot(qRouters, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RouterConfig));
      setRouters(list);
      if (list.length > 0 && !selectedRouter) setSelectedRouter(list[0]);
    });

    // Fetch Vouchers
    const qVouchers = query(collection(db, 'vouchers'), orderBy('createdAt', 'desc'), limit(50));
    const unsubVouchers = onSnapshot(qVouchers, (snapshot) => {
      setVouchers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Voucher)));
    });

    // Fetch Sales
    const qSales = query(collection(db, 'sales'), orderBy('soldAt', 'desc'), limit(100));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch Profiles
    const qProfiles = query(collection(db, 'profiles'), orderBy('price', 'asc'));
    const unsubProfiles = onSnapshot(qProfiles, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile));
      setProfiles(list);
      // Auto-populate profiles if empty
      if (list.length === 0 && user) {
        const initialProfiles = [
          { name: '200 RY', price: 170, rateLimit: '5M/5M', sessionTimeout: '8h', validity: '2d' },
          { name: '500 RY', price: 430, rateLimit: '5M/5M', sessionTimeout: '16h', validity: '5d' },
          { name: '1000 RY', price: 850, rateLimit: '5M/5M', sessionTimeout: '1d6h', validity: '1w3d' },
          { name: '1500 RY NEW', price: 1500, rateLimit: '5M/5M', sessionTimeout: '2w6d', validity: '2w6d' },
          { name: '2500 RY', price: 2500, rateLimit: '5M/5M', sessionTimeout: '4w2d', validity: '4w2d' },
          { name: '3000 RY', price: 3000, rateLimit: '5M/5M', sessionTimeout: '4w2d', validity: '4w2d' },
          { name: '3500 RY FAST', price: 3500, rateLimit: '5M/5M', sessionTimeout: '4w2d', validity: '4w2d' },
          { name: '5000 RY', price: 5000, rateLimit: '5M/5M', sessionTimeout: '4w2d', validity: '4w2d' },
          { name: '10000 RY', price: 10000, rateLimit: '5M/5M', sessionTimeout: '0s', validity: '4w2d' },
          { name: '15000 RY', price: 15000, rateLimit: '5M/5M', sessionTimeout: '0s', validity: '4w2d' },
        ];
        initialProfiles.forEach(p => addDoc(collection(db, 'profiles'), p));
      }
    });

    // Fetch Resellers
    const qResellers = query(collection(db, 'resellers'));
    const unsubResellers = onSnapshot(qResellers, (snapshot) => {
      setResellers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reseller)));
    });

    return () => {
      unsubRouters();
      unsubVouchers();
      unsubSales();
      unsubProfiles();
      unsubResellers();
    };
  }, [user]);

  // Periodic Router Data Fetch
  useEffect(() => {
    if (!selectedRouter) return;
    
  const fetchData = async () => {
      if (!selectedRouter) return;
      setConnectionStatus('checking');
      try {
        const resourceRes = await fetch('/api/router/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: selectedRouter })
        }).then(r => r.json());

        if (resourceRes && !resourceRes.error) {
          setRouterResources(resourceRes);
          setConnectionStatus('online');
          setLastError(null);
          
          // Parallelize data fetching
          const [activeRes, usermanRes] = await Promise.all([
            fetch('/api/router/hotspot/active', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ config: selectedRouter })
            }).then(r => r.json()).catch(() => []),
            fetch('/api/router/userman/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ config: selectedRouter })
            }).then(r => r.json()).catch(() => [])
          ]);
          
          if (Array.isArray(activeRes)) setActiveUsers(activeRes);
          if (Array.isArray(usermanRes)) setUsermanUsers(usermanRes);
        } else {
          setConnectionStatus('offline');
          setLastError(resourceRes.error || "Connection timeout");
          setActiveUsers([]);
          setUsermanUsers([]);
        }
      } catch (e) {
        setConnectionStatus('offline');
        setLastError("Network error connecting to proxy");
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Every 10s
    return () => clearInterval(interval);
  }, [selectedRouter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
          <Router size={64} className="text-indigo-400 mb-6 mx-auto" />
          <h1 className="text-3xl font-bold mb-2">MikroTik Manager</h1>
          <p className="text-slate-400 mb-8">Professional Hotspot & Voucher Management System</p>
          <button 
            onClick={loginWithGoogle}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'vouchers', label: 'Vouchers', icon: Ticket },
    { id: 'userman', label: 'User Manager', icon: Router },
    { id: 'resellers', label: 'Resellers', icon: UserPlus },
    { id: 'active', label: 'Active Users', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Router size={24} />
          </div>
          <h2 className="font-bold text-xl tracking-tight">MT Manager</h2>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 mb-6">
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border-2 border-indigo-500" alt="Profile" />
            <div className="overflow-hidden">
              <p className="text-sm font-semibold truncate">{user.displayName}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-10 flex items-center justify-between">
          <h2 className="text-2xl font-bold capitalize">{activeTab.replace('-', ' ')}</h2>
          
          <div className="flex items-center gap-4">
            {lastError && (
              <div className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-full animate-pulse max-w-[200px] truncate">
                Error: {lastError}
              </div>
            )}
            {routers.length > 0 && (
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  connectionStatus === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 
                  connectionStatus === 'offline' ? 'bg-red-500' : 'bg-amber-500 animate-bounce'
                }`} />
                <select 
                  value={selectedRouter?.id} 
                  onChange={(e) => setSelectedRouter(routers.find(r => r.id === e.target.value) || null)}
                  className="bg-slate-100 border-none rounded-lg px-4 py-2 font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
            <div className="h-8 w-px bg-slate-200" />
            <button className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-all">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <DashboardView 
                  resources={routerResources} 
                  activeUsers={activeUsers} 
                  vouchers={vouchers} 
                  sales={sales}
                />
              )}
              {activeTab === 'vouchers' && <VouchersView vouchers={vouchers} profiles={profiles} resellers={resellers} selectedRouter={selectedRouter} />}
              {activeTab === 'userman' && <UserManagerView users={usermanUsers} selectedRouter={selectedRouter} profiles={profiles} />}
              {activeTab === 'resellers' && <ResellersView resellers={resellers} />}
              {activeTab === 'active' && <ActiveUsersView activeUsers={activeUsers} />}
              {activeTab === 'settings' && <SettingsView routers={routers} profiles={profiles} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

function DashboardView({ resources, activeUsers, vouchers, sales }: any) {
  const totalRevenue = sales.reduce((acc: number, sale: any) => acc + (sale.amount || 0), 0);
  
  const stats = [
    { label: 'Active Users', value: activeUsers.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Total Sales', value: `${totalRevenue} RY`, icon: BarChart3, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Cloud Vouchers', value: vouchers.length, icon: Ticket, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { label: 'Router Uptime', value: resources?.uptime || '0s', icon: RefreshCw, color: 'text-amber-600', bg: 'bg-amber-100' },
  ];

  // Process sales data for chart
  const salesByDay = sales.reduce((acc: any, sale: any) => {
    const date = sale.soldAt?.toDate().toLocaleDateString() || 'Pending';
    acc[date] = (acc[date] || 0) + (sale.amount || 0);
    return acc;
  }, {});

  const chartData = Object.keys(salesByDay).map(date => ({
    date,
    revenue: salesByDay[date]
  })).reverse().slice(-7); // Last 7 days

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                <stat.icon size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <p className="text-xl font-bold font-mono">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold mb-6">Revenue Overview (RY)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold mb-6">Recent Sales</h3>
          <div className="space-y-4">
            {sales.slice(0, 5).map((sale: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
                    <Ticket size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Voucher Sale</p>
                    <p className="text-xs text-slate-400">{sale.soldAt?.toDate().toLocaleTimeString()}</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-indigo-600">+{sale.amount} RY</p>
              </div>
            ))}
            {sales.length === 0 && <p className="text-center text-slate-400 py-8">No recent sales</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function VouchersView({ vouchers, profiles, resellers, selectedRouter }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [showSell, setShowSell] = useState<any>(null);
  const [genCount, setGenCount] = useState(10);
  const [genProfile, setGenProfile] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedReseller, setSelectedReseller] = useState('');

  const generateVouchers = async () => {
    if (!genProfile || !selectedRouter) return alert("Please select a profile and router");
    setIsGenerating(true);
    
    const profileObj = profiles.find((p: any) => p.name === genProfile);
    
    for (let i = 0; i < genCount; i++) {
      const code = Math.random().toString().slice(2, 8); // 6 digit code
      try {
        await fetch('/api/router/hotspot/add-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            config: selectedRouter,
            user: { name: code, password: code, profile: genProfile }
          })
        });

        await addDoc(collection(db, 'vouchers'), {
          code,
          profile: genProfile,
          status: VoucherStatus.NEW,
          price: profileObj?.price || 0,
          routerId: selectedRouter.id,
          createdAt: Timestamp.now(),
        });
      } catch (e) {
        console.error("Error generating voucher", e);
      }
    }
    setIsGenerating(false);
    setShowAdd(false);
  };

  const sellVoucher = async () => {
    if (!selectedReseller || !showSell) return;
    const reseller = resellers.find((r: any) => r.id === selectedReseller);
    if (!reseller) return;
    
    if (reseller.balance < showSell.price) {
      alert("Insufficient balance for this reseller!");
      return;
    }

    try {
      // Update voucher status
      await updateDoc(doc(db, 'vouchers', showSell.id), {
        status: VoucherStatus.SOLD,
        resellerId: reseller.id,
        soldAt: Timestamp.now()
      });

      // Update reseller balance
      await updateDoc(doc(db, 'resellers', reseller.id), {
        balance: reseller.balance - showSell.price
      });

      // Record sale
      await addDoc(collection(db, 'sales'), {
        voucherId: showSell.id,
        resellerId: reseller.id,
        amount: showSell.price,
        soldAt: Timestamp.now()
      });

      setShowSell(null);
    } catch (e) {
      console.error("Sale failed", e);
    }
  };

  const printVouchers = () => {
    window.print();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 no-print">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search vouchers..." 
            className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex gap-3">
          <button 
            onClick={printVouchers}
            className="bg-slate-800 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-slate-700"
          >
            <RefreshCw size={18} /> Print All
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-indigo-700"
          >
            <Plus size={18} /> Bulk Generate
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 no-print">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-600">Code</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Profile</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Status</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Price</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 print:grid print:grid-cols-4 print:gap-4 print:p-4">
            {vouchers.map((v: any) => (
              <tr key={v.id} className="hover:bg-slate-50 transition-all print:border print:border-slate-300 print:rounded-lg print:p-4 print:flex print:flex-col print:items-center">
                <td className="px-6 py-4 font-mono font-bold text-lg print:p-0 print:mb-2">{v.code}</td>
                <td className="px-6 py-4 print:p-0 print:text-sm print:mb-1">{v.profile}</td>
                <td className="px-6 py-4 no-print">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${
                    v.status === 'new' ? 'bg-green-100 text-green-700' : 
                    v.status === 'sold' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {v.status}
                  </span>
                </td>
                <td className="px-6 py-4 font-medium print:p-0 print:text-lg">{v.price} RY</td>
                <td className="px-6 py-4 no-print">
                  {v.status === VoucherStatus.NEW && (
                    <button 
                      onClick={() => setShowSell(v)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm"
                    >
                      Sell to Reseller
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Bulk Generate Vouchers</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Count</label>
                <input 
                  type="number" 
                  value={genCount} 
                  onChange={(e) => setGenCount(parseInt(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Profile</label>
                <select 
                  className="w-full border border-slate-200 rounded-lg px-4 py-2"
                  value={genProfile}
                  onChange={(e) => setGenProfile(e.target.value)}
                >
                  <option value="">Select Profile</option>
                  {profiles.map((p: any) => <option key={p.id} value={p.name}>{p.name} ({p.price} RY)</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button 
                onClick={generateVouchers}
                disabled={isGenerating}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-2">Sell Voucher</h3>
            <p className="text-slate-500 mb-6">Voucher: <span className="font-mono font-bold text-slate-900">{showSell.code}</span> ({showSell.price} RY)</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Reseller</label>
                <select 
                  className="w-full border border-slate-200 rounded-lg px-4 py-2"
                  value={selectedReseller}
                  onChange={(e) => setSelectedReseller(e.target.value)}
                >
                  <option value="">Select Reseller</option>
                  {resellers.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (Balance: {r.balance} RY)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => setShowSell(null)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button 
                onClick={sellVoucher}
                disabled={!selectedReseller}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Confirm Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResellersView({ resellers }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [showBalance, setShowBalance] = useState<any>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [balance, setBalance] = useState(0);
  const [amountToAdd, setAmountToAdd] = useState(0);

  const addReseller = async () => {
    await addDoc(collection(db, 'resellers'), { name, phone, balance: Number(balance) });
    setShowAdd(false);
  };

  const updateBalance = async () => {
    if (!showBalance) return;
    try {
      await updateDoc(doc(db, 'resellers', showBalance.id), {
        balance: showBalance.balance + amountToAdd
      });
      setShowBalance(null);
      setAmountToAdd(0);
    } catch (e) {
      console.error("Balance update failed", e);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold">Managed Resellers</h3>
        <button onClick={() => setShowAdd(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2">
          <Plus size={18} /> Add Reseller
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {resellers.map((r: any) => (
          <div key={r.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-bold text-lg">{r.name}</h4>
                <p className="text-sm text-slate-500">{r.phone}</p>
              </div>
              <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-bold">
                {r.balance} RY
              </div>
            </div>
            <button 
              onClick={() => setShowBalance(r)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-lg transition-all"
            >
              Add Balance
            </button>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Add New Reseller</h3>
            <div className="space-y-4">
              <input placeholder="Name" className="w-full border border-slate-200 rounded-lg px-4 py-2" value={name} onChange={e => setName(e.target.value)} />
              <input placeholder="Phone" className="w-full border border-slate-200 rounded-lg px-4 py-2" value={phone} onChange={e => setPhone(e.target.value)} />
              <input type="number" placeholder="Initial Balance" className="w-full border border-slate-200 rounded-lg px-4 py-2" value={balance} onChange={e => setBalance(Number(e.target.value))} />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg">Cancel</button>
              <button onClick={addReseller} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg">Add</button>
            </div>
          </div>
        </div>
      )}

      {showBalance && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-2">Update Balance</h3>
            <p className="text-slate-500 mb-6 font-semibold">Reseller: {showBalance.name}</p>
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount to Add (RY)</label>
              <input 
                type="number" 
                placeholder="0" 
                className="w-full border border-slate-200 rounded-lg px-4 py-2" 
                onChange={e => setAmountToAdd(Number(e.target.value))} 
              />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowBalance(null)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg">Cancel</button>
              <button onClick={updateBalance} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg">Add Balance</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveUsersView({ activeUsers }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-6 py-4 font-semibold text-slate-600">User</th>
            <th className="px-6 py-4 font-semibold text-slate-600">IP Address</th>
            <th className="px-6 py-4 font-semibold text-slate-600">MAC</th>
            <th className="px-6 py-4 font-semibold text-slate-600">Uptime</th>
            <th className="px-6 py-4 font-semibold text-slate-600">Traffic</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {activeUsers.length === 0 ? (
            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No active sessions</td></tr>
          ) : activeUsers.map((u: any, i: number) => (
            <tr key={i} className="hover:bg-slate-50 transition-all">
              <td className="px-6 py-4 font-medium">{u.user}</td>
              <td className="px-6 py-4 font-mono text-sm">{u.address}</td>
              <td className="px-6 py-4 font-mono text-sm">{u['mac-address']}</td>
              <td className="px-6 py-4 text-sm">{u.uptime}</td>
              <td className="px-6 py-4 text-sm">
                <span className="text-green-600 font-medium">↓{u['bytes-out']}</span>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-blue-600 font-medium">↑{u['bytes-in']}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserManagerView({ users, selectedRouter, profiles }: any) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [genCount, setGenCount] = useState(10);
  const [genProfile, setGenProfile] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const filteredUsers = users.filter((u: any) => 
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  const generateUsermanVouchers = async () => {
    if (!genProfile || !selectedRouter) return alert("Please select a profile and router");
    setIsGenerating(true);
    
    for (let i = 0; i < genCount; i++) {
      const code = Math.random().toString().slice(2, 8); // 6 digit code
      try {
        await fetch('/api/router/userman/add-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            config: selectedRouter,
            user: { name: code, password: code, profile: genProfile, customer: 'admin' }
          })
        });
      } catch (e) {
        console.error("Error generating User Manager voucher", e);
      }
    }
    setIsGenerating(false);
    setShowAdd(false);
    alert("Generated successfully! Please refresh or wait for sync.");
  };

  const printVouchers = () => {
    window.print();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 no-print">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search User Manager..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex gap-3">
          <button 
            onClick={printVouchers}
            className="bg-slate-800 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-slate-700"
          >
            <RefreshCw size={18} /> Print Filtered
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-indigo-700"
          >
            <Plus size={18} /> Bulk Generate
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 no-print">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-600">Username</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Password</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Uptime</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 print:grid print:grid-cols-4 print:gap-4 print:p-4">
            {filteredUsers.length === 0 ? (
              <tr className="no-print">
                <td colSpan={4} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Router size={48} className="text-slate-200" />
                    <p className="text-slate-500 font-medium">لم يتم العثور على مستخدمين أو الميكروتيك غير متصل</p>
                    <p className="text-xs text-slate-400">تأكد من فتح بورت 8728 واستخدام Public IP</p>
                  </div>
                </td>
              </tr>
            ) : filteredUsers.map((u: any, i: number) => (
              <tr key={i} className="hover:bg-slate-50 transition-all print:border print:border-slate-300 print:rounded-lg print:p-4 print:flex print:flex-col print:items-center">
                <td className="px-6 py-4 font-mono font-bold text-lg print:p-0 print:mb-2">{u.username}</td>
                <td className="px-6 py-4 font-mono no-print">{u.password}</td>
                <td className="px-6 py-4 text-sm no-print">{u.uptime}</td>
                <td className="px-6 py-4 text-sm font-medium print:p-0 print:text-sm">{u['download-used']}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Bulk Generate User Manager Vouchers</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Count</label>
                <input 
                  type="number" 
                  value={genCount} 
                  onChange={(e) => setGenCount(parseInt(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Userman Profile (Must exist in Router)</label>
                <input 
                  className="w-full border border-slate-200 rounded-lg px-4 py-2"
                  value={genProfile}
                  placeholder="e.g. 500RY"
                  onChange={(e) => setGenProfile(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg">Cancel</button>
              <button 
                onClick={generateUsermanVouchers}
                disabled={isGenerating}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsView({ routers, profiles }: any) {
  const [showAddRouter, setShowAddRouter] = useState(false);
  const [showAddProfile, setShowAddProfile] = useState(false);

  // Form states
  const [routerForm, setRouterForm] = useState({ name: '', host: '', user: '', password: '', port: 8728 });
  const [profileForm, setProfileForm] = useState({ name: '', rateLimit: '', sessionTimeout: '', price: 0 });

  const addRouter = async () => {
    await addDoc(collection(db, 'routers'), routerForm);
    setShowAddRouter(false);
  };

  const addProfile = async () => {
    await addDoc(collection(db, 'profiles'), profileForm);
    setShowAddProfile(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Connection Tip */}
      <div className="lg:col-span-2 bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex gap-4 items-start">
        <div className="bg-white p-2 rounded-lg text-indigo-600 shadow-sm">
          <Router size={20} />
        </div>
        <div className="text-sm">
          <p className="font-bold text-indigo-900 mb-1">ملاحظة هامة للربط (MikroTik Connectivity):</p>
          <p className="text-indigo-700">هذا التطبيق يعمل على سحابة الإنترنت. للوصول للميكروتيك الخاص بك:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-indigo-600">
            <li>يجب استخدام <b>IP خارجي حقيقي (Public IP)</b> أو خدمة <b>DDNS</b>.</li>
            <li>تأكد من تفعيل خدمة الـ API في الميكروتيك: <code className="bg-white px-1 rounded">/ip service enable api</code></li>
            <li>تأكد من فتح بورت <b>8728</b> في جدار الحماية (Firewall Input).</li>
            <li>العناوين المحلية مثل <code className="bg-white px-1 rounded">192.168.x.x</code> لن تعمل هنا.</li>
          </ul>
        </div>
      </div>

      {/* Mikrotik Connection Setup */}
      <section className="bg-slate-900 text-white p-8 rounded-2xl shadow-xl border border-slate-800">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-indigo-500 p-3 rounded-xl shadow-lg shadow-indigo-500/20">
            <Terminal size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">MikroTik API Setup</h3>
            <p className="text-slate-400 text-sm">انسخ الأوامر التالية لتفعيل الربط في جهازك</p>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-slate-800 p-4 rounded-xl relative group">
            <code className="text-indigo-300 text-sm block">
              /ip service enable api<br/>
              /ip firewall filter add chain=input protocol=tcp dst-port=8728 action=accept comment="Allow Cloud API"
            </code>
            <button 
              onClick={() => {
                navigator.clipboard.writeText('/ip service enable api\n/ip firewall filter add chain=input protocol=tcp dst-port=8728 action=accept');
                alert("Copied to clipboard!");
              }}
              className="absolute top-4 right-4 bg-slate-700 hover:bg-slate-600 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          
          <div className="flex gap-4 p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <div className="text-indigo-400 shrink-0">
              <Plus size={20} />
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              <b>تنبيه:</b> الـ IP الداخلي (192.168.x.x) لن يعمل. يجب استخدام IP حقيقي أو DDNS.
            </p>
          </div>
        </div>
      </section>

      {/* Routers */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Router Configurations</h3>
          <button onClick={() => setShowAddRouter(true)} className="text-indigo-600 font-medium flex items-center gap-1">
            <Plus size={16} /> Add
          </button>
        </div>
        <div className="space-y-4">
          {routers.map((r: any) => (
            <div key={r.id} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
              <div>
                <p className="font-bold">{r.name}</p>
                <p className="text-xs text-slate-500">{r.host}:{r.port}</p>
              </div>
              <span className="text-xs bg-slate-100 px-2 py-1 rounded">V7 API</span>
            </div>
          ))}
        </div>
      </section>

      {/* Profiles */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Hotspot Profiles</h3>
          <button onClick={() => setShowAddProfile(true)} className="text-indigo-600 font-medium flex items-center gap-1">
            <Plus size={16} /> Add
          </button>
        </div>
        <div className="space-y-4">
          {profiles.map((p: any) => (
            <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
              <div>
                <p className="font-bold">{p.name}</p>
                <p className="text-xs text-slate-500">{p.rateLimit} | {p.sessionTimeout} | {p.validity || 'N/A'}</p>
              </div>
              <p className="font-bold text-indigo-600">{p.price} RY</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form Modals */}
      {showAddRouter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Add Router</h3>
            <div className="space-y-4">
              <input placeholder="Name (e.g. Branch 1)" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setRouterForm({...routerForm, name: e.target.value})} />
              <input placeholder="IP / Host" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setRouterForm({...routerForm, host: e.target.value})} />
              <input placeholder="User" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setRouterForm({...routerForm, user: e.target.value})} />
              <input type="password" placeholder="Password" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setRouterForm({...routerForm, password: e.target.value})} />
              <input type="number" placeholder="Port (Default 8728)" className="w-full border border-slate-200 rounded-lg px-4 py-2" defaultValue={8728} onChange={e => setRouterForm({...routerForm, port: parseInt(e.target.value)})} />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowAddRouter(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg">Cancel</button>
              <button onClick={addRouter} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      {showAddProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Add Profile</h3>
            <div className="space-y-4">
              <input placeholder="Profile Name (Must match MT)" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
              <input placeholder="Rate Limit (e.g. 2M/2M)" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setProfileForm({...profileForm, rateLimit: e.target.value})} />
              <input placeholder="Session Timeout (e.g. 1d)" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setProfileForm({...profileForm, sessionTimeout: e.target.value})} />
              <input placeholder="Validity (e.g. 4w2d)" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setProfileForm({...profileForm, validity: e.target.value})} />
              <input type="number" placeholder="Price" className="w-full border border-slate-200 rounded-lg px-4 py-2" onChange={e => setProfileForm({...profileForm, price: parseFloat(e.target.value)})} />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowAddProfile(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg">Cancel</button>
              <button onClick={addProfile} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
