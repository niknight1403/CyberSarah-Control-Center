import os
import json

BASE_DIR = "/opt/cybersarah-control-center"
FRONTEND_DIR = f"{BASE_DIR}/frontend"

def create_frontend_structure():
    os.makedirs(f"{FRONTEND_DIR}/src/screens", exist_ok=True)
    os.makedirs(f"{FRONTEND_DIR}/src/services", exist_ok=True)
    os.makedirs(f"{FRONTEND_DIR}/src/components", exist_ok=True)

    # 1. package.json für Expo / React Native
    package_json = {
        "name": "cybersarah-control-center-mobile",
        "version": "1.0.0",
        "scripts": {
            "start": "expo start",
            "android": "expo start --android",
            "ios": "expo start --ios"
        },
        "dependencies": {
            "expo": "~51.0.0",
            "react": "18.3.1",
            "react-native": "0.74.5",
            "@react-navigation/native": "^6.1.9",
            "@react-navigation/native-stack": "^6.9.17",
            "axios": "^1.7.9"
        },
        "private": True
    }
    with open(f"{FRONTEND_DIR}/package.json", "w", encoding="utf-8") as f:
        json.dump(package_json, f, indent=4)

    # 2. API Service für die Kommunikation mit dem Flask-Backend
    api_service_code = '''import axios from 'axios';

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
'''
    with open(f"{FRONTEND_DIR}/src/services/api.js", "w", encoding="utf-8") as f:
        f.write(api_service_code)

    # 3. App.js (Entry Point im Cyber-Dark-Design)
    app_js_code = '''import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { apiClient } from './src/services/api';

export default function App() {
  const [email, setEmail] = useState('niko.oeben@gmail.com');
  const [password, setPassword] = useState('Niko6529!!!!!');
  const [authData, setAuthData] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    async function fetchServerData() {
      const status = await apiClient.getStatus();
      setServerStatus(status);
      const staging = await apiClient.getStagingProducts();
      setProducts(staging.products || []);
    }
    fetchServerData();
  }, []);

  const handleLogin = async () => {
    const res = await apiClient.login(email, password);
    if (res.status === 'success') {
      setAuthData(res);
    } else {
      alert(res.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.header}>CYBERSARAH</Text>
        <Text style={styles.subheader}>Control Center & Revenue OS</Text>

        {serverStatus && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>SYSTEM STATUS</Text>
            <Text style={styles.greenText}>Status: {serverStatus.status}</Text>
            <Text style={styles.whiteText}>Admin: {serverStatus.admin} (Elite)</Text>
            <Text style={styles.whiteText}>Routen: {serverStatus.active_routes.join(', ')}</Text>
          </View>
        )}

        {!authData ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ELITE ADMIN LOGIN</Text>
            <TextInput 
              style={styles.input} 
              value={email} 
              onChangeText={setEmail} 
              placeholder="Email" 
              placeholderTextColor="#666"
            />
            <TextInput 
              style={styles.input} 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry 
              placeholder="Passwort" 
              placeholderTextColor="#666"
            />
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
              <Text style={styles.buttonText}>AUTORISIEREN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>STAGING PRODUKTE (QUEUE)</Text>
            {products.map((p, index) => (
              <View key={index} style={styles.productItem}>
                <Text style={styles.productName}>{p.product_name}</Text>
                <Text style={styles.nicheText}>Nische: {p.niche}</Text>
                <TouchableOpacity style={styles.approveButton}>
                  <Text style={styles.approveButtonText}>FREIGEBEN & PUBLIZIEREN</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { padding: 20 },
  header: { fontSize: 28, fontWeight: 'bold', color: '#00FF66', textAlign: 'center', letterSpacing: 2 },
  subheader: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: '#141414', borderRadius: 12, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFF', marginBottom: 10, letterSpacing: 1 },
  greenText: { color: '#00FF66', fontWeight: 'bold', marginBottom: 5 },
  whiteText: { color: '#CCC', marginBottom: 5 },
  input: { backgroundColor: '#1F1F1F', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  button: { backgroundColor: '#00FF66', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  buttonText: { color: '#000', fontWeight: 'bold', letterSpacing: 1 },
  productItem: { backgroundColor: '#1A1A1A', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  productName: { color: '#FFF', fontWeight: 'bold' },
  nicheText: { color: '#888', fontSize: 12, marginBottom: 8 },
  approveButton: { backgroundColor: '#0088FF', padding: 8, borderRadius: 6, alignItems: 'center' },
  approveButtonText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' }
});
'''
    with open(f"{FRONTEND_DIR}/App.js", "w", encoding="utf-8") as f:
        f.write(app_js_code)
    
    print("[SUCCESS] Frontend-Struktur erfolgreich im Mono-Repo angelegt.")

if __name__ == "__main__":
    create_frontend_structure()
