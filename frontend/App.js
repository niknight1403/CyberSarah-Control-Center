import React, { useState, useEffect } from 'react';
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
