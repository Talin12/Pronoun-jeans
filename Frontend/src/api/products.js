import api from './axios';

export const productQueries = {
  // Fetches the full list of products (paginated by DRF)
  getProducts: async (page = 1) => {
    const response = await api.get(`products/catalog/?page=${page}`);
    return response.data; 
  },

  // Fetches a single product detail by its slug
  getProductDetail: async (slug) => {
    const response = await api.get(`products/catalog/${slug}/`);
    return response.data;
  },

  // Fetches categories for the filter sidebar
  getCategories: async () => {
    const response = await api.get('products/categories/');
    return response.data;
  }
};