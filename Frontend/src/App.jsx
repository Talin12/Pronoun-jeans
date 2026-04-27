import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import WhatsAppCTA from './components/ui/WhatsAppCTA';
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

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const token = localStorage.getItem('accessToken');
  return token ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

function App() {
  return (
    <BrowserRouter>
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
            <Route path="/login"                  element={<Login />} />
            <Route path="/catalog"                element={<Catalog />} />
            <Route path="/catalog/:category_slug" element={<CategoryProducts />} />
            <Route path="/product/:slug"          element={<ProductDetail />} />
            <Route path="/cart"                   element={<ProtectedRoute><Cart /></ProtectedRoute>} />
            <Route path="/history"                element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
            <Route path="/dashboard"              element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          </Routes>
        </main>
        <Footer />
        <WhatsAppCTA />
      </div>
    </BrowserRouter>
  );
}

export default App;