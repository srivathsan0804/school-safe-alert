import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { database } from '../../firebaseConfig'; // Look for the file in the root
import { ref, push, serverTimestamp } from "firebase/database"; 

export default function HomeScreen() {
  
  const handlePress = () => {
    try {
      // 1. Create a reference to a folder in your database called 'alerts'
      const alertsRef = ref(database, 'alerts');

      // 2. Push a new alert object into that folder
      push(alertsRef, {
        type: "PANIC_BUTTON_PRESSED",
        location: "Main Hallway", // You can change this later
        timestamp: serverTimestamp(),
        status: "active"
      });

      Alert.alert("SUCCESS", "Emergency alert sent to school security!");
    } catch (error) {
      console.error(error);
      Alert.alert("ERROR", "Failed to connect to database. Check your internet.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Smart School Safe</Text>
      
      <TouchableOpacity 
        activeOpacity={0.7} 
        style={styles.panicButton} 
        onPress={handlePress}
      >
        <View style={styles.innerCircle}>
          <Text style={styles.buttonText}>EMERGENCY ALERT</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 80,
    letterSpacing: 1,
  },
  panicButton: {
    width: 280,
    height: 280,
    backgroundColor: '#7f0000',
    borderRadius: 140,
    alignItems: 'center',
    justifyContent: 'center',
    // Glow effect
    elevation: 20,
    shadowColor: '#ff0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  innerCircle: {
    width: 240,
    height: 240,
    backgroundColor: '#d32f2f',
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#ff6666',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  }
});