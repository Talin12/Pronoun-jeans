import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import AboutUs from './pages/AboutUs';
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
      <Navbar />
      <Routes>
        <Route path="/"                       element={<Home />} />
        <Route path="/about"                  element={<AboutUs />} />
        <Route path="/login"                  element={<Login />} />
        <Route path="/catalog"                element={<Catalog />} />
        <Route path="/catalog/:category_slug" element={<CategoryProducts />} />
        <Route path="/product/:slug"          element={<ProductDetail />} />
        <Route path="/cart"                   element={<ProtectedRoute><Cart /></ProtectedRoute>} />
        <Route path="/history"                element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
        <Route path="/dashboard"              element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;