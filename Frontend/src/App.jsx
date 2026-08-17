import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/useAuthStore';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import WhatsAppCTA from './components/ui/WhatsAppCTA';
import AgentRoute from './components/auth/AgentRoute';
import AgentLayout from './components/agent/AgentLayout';
import AdminRoute from './components/auth/AdminRoute';
import AdminLayout from './components/admin/AdminLayout';

import Home from './pages/Home';
import Login from './pages/Login';
import AboutUs from './pages/AboutUs';
import Contact from './pages/Contact';
import Legal from './pages/Legal';
import Catalog from './pages/Catalog';
import CategoryProducts from './pages/CategoryProducts';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import OrderHistory from './pages/OrderHistory';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import ResetPassword from './pages/ResetPassword';

import AgentDashboard    from './pages/agent/AgentDashboard';
import AgentBuyers       from './pages/agent/AgentBuyers';
import AgentOrders       from './pages/agent/AgentOrders';
import AgentCommissions  from './pages/agent/AgentCommissions';
import AgentSampleOrders from './pages/agent/AgentSampleOrders';

import AdminDashboard     from './pages/admin/AdminDashboard';
import AdminProducts      from './pages/admin/AdminProducts';
import AdminProductEditor from './pages/admin/AdminProductEditor';
import AdminCategories    from './pages/admin/AdminCategories';
import AdminCategoryProducts from './pages/admin/AdminCategoryProducts';

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
    </BrowserRouter>
  );
}

export default App;