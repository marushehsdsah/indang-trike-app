import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

const pastRides = [
  { id: '1', date: 'Oct 24', from: 'CvSU Main', to: 'Bancod', fare: '₱35.00', status: 'Completed' },
  { id: '2', date: 'Oct 22', from: 'Public Market', to: 'Alulod', fare: '₱40.00', status: 'Completed' },
];

export default function OrdersScreen() {
  return (
    <View style={styles.container}>
      <FlatList
        data={pastRides}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.route}>{item.from} ➔ {item.to}</Text>
            <View style={styles.row}>
              <Text style={styles.fare}>{item.fare}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2 },
  date: { fontSize: 14, color: '#7f8c8d', marginBottom: 5 },
  route: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  fare: { fontSize: 16, color: '#27ae60', fontWeight: 'bold' },
  status: { fontSize: 14, color: '#16a085', fontStyle: 'italic' }
});