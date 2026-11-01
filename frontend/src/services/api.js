import axios from 'axios';

// Ersetze dies durch deine Server-IP oder lokale Adresse
const API_BASE_URL = 'http://167.233.196.20:5000/api';

export const apiClient = {
    async getStatus() {
        try {
            const response = await axios.get(`${API_BASE_URL}/status`);
            return response.data;
        } catch (error) {
            console.error("API Error (Status):", error);
            return null;
        }
    },

    async getStagingProducts() {
        try {
            const response = await axios.get(`${API_BASE_URL}/products/staging`);
            return response.data;
        } catch (error) {
            console.error("API Error (Staging):", error);
            return { products: [] };
        }
    },

    async login(email, password) {
        try {
            const response = await axios.post(`${API_BASE_URL}/auth/login`, { email, password });
            return response.data;
        } catch (error) {
            console.error("API Error (Login):", error);
            return { status: "error", message: "Verbindungsfehler" };
        }
    }
};
