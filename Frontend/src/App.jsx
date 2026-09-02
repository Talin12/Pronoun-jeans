import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { useAuthStore } from './store/useAuthStore';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import WhatsAppCTA from './components/ui/WhatsAppCTA';
import AgentRoute from './components/auth/AgentRoute';
import AdminRoute from './components/auth/AdminRoute';

// Eager: everything an anonymous visitor can land on. These are the pages
// Google crawls and buyers see first, so they stay in the entry chunk.
import Home from './pages/Home';
import Login from './pages/Login';
import AboutUs from './pages/AboutUs';
import Contact from './pages/Contact';
import Catalog from './pages/Catalog';
import CategoryProducts from './pages/CategoryProducts';
import ProductDetail from './pages/ProductDetail';
import NotFound from './pages/NotFound';

// Lazy: signed-in and staff-only surfaces. The admin and agent portals alone
// were most of the bundle, and every anonymous visitor was downloading them.
const Legal         = lazy(() => import('./pages/Legal'));
const Cart          = lazy(() => import('./pages/Cart'));
const OrderHistory  = lazy(() => import('./pages/OrderHistory'));
const Dashboard     = lazy(() => import('./pages/Dashboard'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

const AgentLayout        = lazy(() => import('./components/agent/AgentLayout'));
const AgentDashboard     = lazy(() => import('./pages/agent/AgentDashboard'));
const AgentBuyers        = lazy(() => import('./pages/agent/AgentBuyers'));
const AgentOrders        = lazy(() => import('./pages/agent/AgentOrders'));
const AgentCommissions   = lazy(() => import('./pages/agent/AgentCommissions'));
const AgentSampleOrders  = lazy(() => import('./pages/agent/AgentSampleOrders'));

const AdminLayout          = lazy(() => import('./components/admin/AdminLayout'));
const AdminDashboard       = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminProducts        = lazy(() => import('./pages/admin/AdminProducts'));
const AdminProductEditor   = lazy(() => import('./pages/admin/AdminProductEditor'));
const AdminCategories      = lazy(() => import('./pages/admin/AdminCategories'));
const AdminCategoryProducts = lazy(() => import('./pages/admin/AdminCategoryProducts'));
const AdminSizeSets        = lazy(() => import('./pages/admin/AdminSizeSets'));
const AdminAttributes      = lazy(() => import('./pages/admin/AdminAttributes'));
const AdminMedia           = lazy(() => import('./pages/admin/AdminMedia'));
const AdminUsers           = lazy(() => import('./pages/admin/AdminUsers'));
const AdminHeroSlides      = lazy(() => import('./pages/admin/AdminHeroSlides'));
const AdminOrders          = lazy(() => import('./pages/admin/AdminOrders'));
const AdminOrderDetail     = lazy(() => import('./pages/admin/AdminOrderDetail'));
const AdminCarts           = lazy(() => import('./pages/admin/AdminCarts'));
const AdminCoupons         = lazy(() => import('./pages/admin/AdminCoupons'));
const AdminUserProfile     = lazy(() => import('./pages/admin/AdminUserProfile'));

// Same spinner the catalogue uses while its own data loads.
const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-zinc-950">
    <Loader className="animate-spin text-accent w-10 h-10" />
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  return isAuthenticated ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

function App() {
  const initAuth = useAuthStore(s => s.initAuth);
  useEffect(() => { initAuth(); }, []);

  return (
    <BrowserRouter>
      {/* One boundary around every route: the lazy chunks below are the only
          things that suspend, and they each fill the viewport while loading. */}
      <Suspense fallback={<RouteFallback />}>
      <Routes>

        {/* ── Agent portal — full-screen layout, no Navbar/Footer ── */}
        <Route
          path="/agent"
          element={
            <AgentRoute>
              <AgentLayout />
            </AgentRoute>
          }
        >
          <Route index              element={<AgentDashboard />} />
          <Route path="buyers"      element={<AgentBuyers />} />
          <Route path="orders"      element={<AgentOrders />} />
          <Route path="commissions" element={<AgentCommissions />} />
          <Route path="samples"     element={<AgentSampleOrders />} />
        </Route>

        {/* ── Custom admin panel — superuser only, full-screen layout ── */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index                 element={<AdminDashboard />} />
          <Route path="products"        element={<AdminProducts />} />
          <Route path="products/new"    element={<AdminProductEditor />} />
          <Route path="products/:id"    element={<AdminProductEditor />} />
          <Route path="categories"      element={<AdminCategories />} />
          <Route path="categories/:id"  element={<AdminCategoryProducts />} />
          <Route path="size-sets"       element={<AdminSizeSets />} />
          <Route path="attributes"      element={<AdminAttributes />} />
          <Route path="media"           element={<AdminMedia />} />
          <Route path="orders"          element={<AdminOrders />} />
          <Route path="orders/:id"      element={<AdminOrderDetail />} />
          <Route path="carts"           element={<AdminCarts />} />
          <Route path="coupons"         element={<AdminCoupons />} />
          <Route path="hero-slides"     element={<AdminHeroSlides />} />
          <Route path="users"           element={<AdminUsers />} />
          <Route path="users/new"       element={<AdminUserProfile />} />
          <Route path="users/:id"       element={<AdminUserProfile />} />
        </Route>

        {/* ── All other pages — with Navbar + Footer ── */}
        <Route path="*" element={
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/"                       element={<Home />} />
                <Route path="/about"                  element={<AboutUs />} />
                <Route path="/contact"                element={<Contact />} />
                <Route path="/terms"                  element={<Legal page="terms" />} />
                <Route path="/privacy"                element={<Legal page="privacy" />} />
                <Route path="/refund"                 element={<Legal page="refund" />} />
                <Route path="/login"                                    element={<Login />} />
                <Route path="/reset-password/:uid/:token"            element={<ResetPassword />} />
                <Route path="/catalog"                element={<Catalog />} />
                <Route path="/catalog/:category_slug" element={<CategoryProducts />} />
                <Route path="/product/:slug"          element={<ProductDetail />} />
                <Route path="/cart"                   element={<ProtectedRoute><Cart /></ProtectedRoute>} />
                <Route path="/history"                element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
                <Route path="/dashboard"              element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                {/* Catch-all — must be last in this inner Routes block */}
                <Route path="*"                       element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
            <WhatsAppCTA />
          </div>
        } />

      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;